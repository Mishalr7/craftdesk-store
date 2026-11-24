const db = require('../config/connection')
const collection = require('../config/collections')
const bcrypt = require('bcrypt')
const { ObjectId } = require('mongodb')

module.exports = {

  // SIGNUP
  doSignup: (userData) => {
    return new Promise(async (resolve, reject) => {

      // Sanitize & validate inputs
      if (
        typeof userData.email !== 'string' ||
        typeof userData.password !== 'string' ||
        typeof userData.confirmPassword !== 'string'
      ) {
        return reject("Invalid input.");
      }

      const email = userData.email.trim().toLowerCase();
      const firstName = typeof userData.firstName === 'string' ? userData.firstName.trim() : '';
      const lastName = typeof userData.lastName === 'string' ? userData.lastName.trim() : '';

      if (userData.password !== userData.confirmPassword) {
        return reject("Passwords do not match.");
      }

      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{5,}$/;
      if (!passwordRegex.test(userData.password)) {
        return reject("Password must contain at least 1 letter and 1 number and be 5 characters long.");
      }

      try {
        const existingUser = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOne({ email });

        if (existingUser) {
          return reject("Unable to create account with these details. Please try again or log in.");
        }

        const crypto = require('crypto');
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const newUser = {
          firstName,
          lastName,
          email,
          password: hashedPassword,
          isVerified: false,
          verificationToken,
          verificationTokenExpiry,
          addresses: [],
          defaultAddressId: null
        };

        await db.get()
          .collection(collection.USER_COLLECTION)
          .insertOne(newUser);

        resolve({
          email: newUser.email,
          verificationToken
        });

      } catch (err) {
        reject("Signup failed. Please try again.");
      }
    });
  },

  // LOGIN
  doLogin: (userData) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Sanitize inputs
        if (typeof userData.email !== 'string' || typeof userData.password !== 'string') {
          return resolve({ status: false });
        }
        const email = userData.email.trim().toLowerCase();
        const password = userData.password;

        const user = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOne({ email: email })

        if (!user) {
          return resolve({ status: false })
        }

        const match = await bcrypt.compare(password, user.password)

        if (match) {
          if (user.isVerified === false) {
            return resolve({ status: false, notVerified: true, email: user.email });
          }

          // Only expose safe fields to the session — never expose password hash
          const safeUser = {
            _id: user._id,
            email: user.email,
            name: user.name || '',
            firstName: user.firstName || '',
            lastName: user.lastName || '',
          };
          resolve({ user: safeUser, status: true })
        } else {
          resolve({ status: false })
        }

      } catch (err) {
        reject(err)
      }
    })
  }
  ,
  addToCart: (prodId, userId) => {

    return new Promise(async (resolve, reject) => {
      try {
        const product = await db.get()
          .collection(collection.PRODUCT_COLLECTION)
          .findOne({ _id: new ObjectId(prodId) });

        if (!product || !product.stock || (typeof product.stockCount === 'number' && product.stockCount <= 0)) {
          return resolve({ status: false, message: 'This product is out of stock.' });
        }

        let userCart = await db.get()
          .collection(collection.CART_COLLECTION)
          .findOne({ user: new ObjectId(userId) });

        if (userCart) {
          let productExist = userCart.products.findIndex(
            p => p.item.toString() === prodId
          );

          if (productExist !== -1) {
            const currentQty = Number(userCart.products[productExist].quantity) || 0;
            if (typeof product.stockCount === 'number' && currentQty + 1 > product.stockCount) {
              return resolve({ status: false, message: `Only ${product.stockCount} available in stock.` });
            }

            await db.get()
              .collection(collection.CART_COLLECTION)
              .updateOne(
                {
                  user: new ObjectId(userId),
                  'products.item': new ObjectId(prodId)
                },
                {
                  $inc: { 'products.$.quantity': 1 }
                }
              );
          } else {
            await db.get()
              .collection(collection.CART_COLLECTION)
              .updateOne(
                { user: new ObjectId(userId) },
                {
                  $push: {
                    products: {
                      item: new ObjectId(prodId),
                      quantity: 1
                    }
                  }
                }
              );
          }

          resolve({ status: true });
        } else {
          let cartObj = {
            user: new ObjectId(userId),
            products: [
              {
                item: new ObjectId(prodId),
                quantity: 1
              }
            ]
          };

          await db.get()
            .collection(collection.CART_COLLECTION)
            .insertOne(cartObj);

          resolve({ status: true });
        }
      } catch (err) {
        reject(err);
      }
    });

  },
  getCartProducts: (userId) => {

    return new Promise(async (resolve, reject) => {

      let cart = await db.get()
        .collection(collection.CART_COLLECTION)
        .aggregate([

          {
            $match: {
              user: new ObjectId(userId)
            }
          },

          {
            $unwind: '$products'
          },

          {
            $project: {
              item: '$products.item',
              quantity: '$products.quantity'
            }
          },

          {
            $lookup: {
              from: 'products',
              localField: 'item',
              foreignField: '_id',
              as: 'product'
            }
          },

          {
            $project: {
              quantity: 1,
              product: { $arrayElemAt: ['$product', 0] }
            }
          }

        ]).toArray()

      resolve(cart)

    })

  },
  getCartCount: (userId) => {

    return new Promise(async (resolve, reject) => {

      let count = 0

      let cart = await db.get()
        .collection(collection.CART_COLLECTION)
        .findOne({ user: new ObjectId(userId) })

      if (cart) {

        cart.products.forEach(item => {

          count += item.quantity

        })

      }

      resolve(count)

    })

  },
  changeProductQuantity: (userId, productId, action) => {

    return new Promise(async (resolve, reject) => {
      try {
        let cart = await db.get()
          .collection(collection.CART_COLLECTION)
          .findOne({
            user: new ObjectId(userId)
          });

        if (!cart) return resolve({ status: false, message: 'Cart not found' });

        let product = cart.products.find(
          p => p.item.toString() === productId
        );

        if (!product) return resolve({ status: false, message: 'Item not found in cart' });

        if (action === 'decrease' && product.quantity <= 1) {

          await db.get()
            .collection(collection.CART_COLLECTION)
            .updateOne(
              { user: new ObjectId(userId) },
              {
                $pull: {
                  products: {
                    item: new ObjectId(productId)
                  }
                }
              }
            );
          return resolve({ status: true });

        }

        if (action === 'increase') {
          const prodDoc = await db.get()
            .collection(collection.PRODUCT_COLLECTION)
            .findOne({ _id: new ObjectId(productId) });

          if (!prodDoc || !prodDoc.stock || (typeof prodDoc.stockCount === 'number' && prodDoc.stockCount <= 0)) {
            return resolve({ status: false, message: `${prodDoc?.name || 'Product'} is out of stock.` });
          }

          if (typeof prodDoc.stockCount === 'number' && product.quantity + 1 > prodDoc.stockCount) {
            return resolve({ status: false, message: `Only ${prodDoc.stockCount} of "${prodDoc.name}" available in stock.` });
          }
        }

        let count = action === 'increase' ? 1 : -1;

        await db.get()
          .collection(collection.CART_COLLECTION)
          .updateOne(
            {
              user: new ObjectId(userId),
              'products.item': new ObjectId(productId)
            },
            {
              $inc: {
                'products.$.quantity': count
              }
            }
          );

        resolve({ status: true });
      } catch (err) {
        reject(err);
      }
    });

  },
  removeCartItem: (userId, productId) => {

    return new Promise(async (resolve, reject) => {

      await db.get()
        .collection(collection.CART_COLLECTION)
        .updateOne(

          {
            user: new ObjectId(userId)
          },

          {
            $pull: {
              products: {
                item: new ObjectId(productId)
              }
            }
          }

        )

      resolve()

    })

  },
  getAddresses: (userId) => {

    return new Promise(async (resolve, reject) => {

      let user = await db.get()
        .collection(collection.USER_COLLECTION)
        .findOne({

          _id: new ObjectId(userId)

        })

      resolve(user.addresses || [])

    })

  },
  addAddress: (userId, address) => {

    return new Promise(async (resolve, reject) => {

      address._id = new ObjectId()
      address.isDefault = false

      let user = await db.get()
        .collection(collection.USER_COLLECTION)
        .findOne({
          _id: new ObjectId(userId)
        })

      if (!user.addresses || user.addresses.length === 0) {

        address.isDefault = true

      }

      await db.get()
        .collection(collection.USER_COLLECTION)
        .updateOne(
          {
            _id: new ObjectId(userId)
          },
          {
            $push: {
              addresses: address
            }
          }
        )

      resolve()

    })

  },
  setDefaultAddress: (userId, addressId) => {

    return new Promise(async (resolve, reject) => {

      await db.get()
        .collection(collection.USER_COLLECTION)
        .updateOne(
          {
            _id: new ObjectId(userId)
          },
          {
            $set: {
              'addresses.$[].isDefault': false
            }
          }
        )

      await db.get()
        .collection(collection.USER_COLLECTION)
        .updateOne(
          {
            _id: new ObjectId(userId),
            'addresses._id': new ObjectId(addressId)
          },
          {
            $set: {
              'addresses.$.isDefault': true
            }
          }
        )

      resolve()

    })

  },
  deleteAddress: (userId, addressId) => {

    return new Promise(async (resolve, reject) => {

      await db.get()
        .collection(collection.USER_COLLECTION)
        .updateOne(
          {
            _id: new ObjectId(userId)
          },
          {
            $pull: {
              addresses: {
                _id: new ObjectId(addressId)
              }
            }
          }
        )

      resolve()

    })

  },
  placeOrder: (userId, addressId, paymentMethod, paymentId = null, razorpayOrderId = null) => {

    return new Promise(async (resolve, reject) => {

      try {
        let user = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOne({ _id: new ObjectId(userId) });

        let cart = await db.get()
          .collection(collection.CART_COLLECTION)
          .findOne({ user: new ObjectId(userId) });

        if (!cart || !cart.products || cart.products.length === 0) {
          return reject('Cart is empty');
        }

        let address = null;
        if (user && user.addresses) {
          address = user.addresses.find(a => a._id.toString() === addressId);
          if (!address && user.addresses.length > 0) {
            address = user.addresses[0];
          }
        }

        if (!address) {
          address = {
            fullName: user ? (user.name || user.firstName || user.email) : 'Customer',
            phone: '',
            address: 'No address provided',
            city: '',
            state: '',
            pincode: ''
          };
        }

        let totalAmount = 0;
        let orderProducts = [];

        for (let item of cart.products) {
          let prodId = item.item || item._id;
          let qty = Number(item.quantity) || 1;
          if (prodId) {
            let prod = await db.get()
              .collection(collection.PRODUCT_COLLECTION)
              .findOne({ _id: new ObjectId(prodId) });

            if (prod) {
              let price = Number(prod.price) || 0;
              let itemTotal = price * qty;
              totalAmount += itemTotal;

              orderProducts.push({
                item: prod._id,
                name: prod.name,
                price: price,
                quantity: qty,
                itemTotal: itemTotal,
                brand: prod.brand || '',
                images: prod.images || []
              });
            }
          }
        }

        let orderObj = {
          userId: new ObjectId(userId),
          deliveryDetails: {
            fullName: address.fullName || '',
            phone: address.phone || '',
            address: address.address || '',
            city: address.city || '',
            state: address.state || '',
            pincode: address.pincode || ''
          },
          paymentMethod,
          paymentId: paymentId || null,
          razorpayOrderId: razorpayOrderId || null,
          products: orderProducts,
          totalAmount: totalAmount,
          status: 'Placed',
          paymentStatus: paymentMethod === 'ONLINE' ? 'Paid' : 'Pending',
          date: new Date()
        };

        await db.get()
          .collection(collection.ORDER_COLLECTION)
          .insertOne(orderObj);

        // Decrement stockCount for each ordered product
        for (let orderedItem of orderProducts) {
          const prodDoc = await db.get()
            .collection(collection.PRODUCT_COLLECTION)
            .findOne({ _id: orderedItem.item });

          if (prodDoc && typeof prodDoc.stockCount === 'number') {
            const newCount = Math.max(0, prodDoc.stockCount - orderedItem.quantity);
            await db.get()
              .collection(collection.PRODUCT_COLLECTION)
              .updateOne(
                { _id: orderedItem.item },
                { $set: { stockCount: newCount, stock: newCount > 0 } }
              );
          }
        }

        await db.get()
          .collection(collection.CART_COLLECTION)
          .deleteOne({ user: new ObjectId(userId) });

        resolve();
      } catch (err) {
        console.log("placeOrder error:", err);
        reject(err);
      }

    })

  },

  getOrders: (userId) => {

    return new Promise(async (resolve, reject) => {

      try {
        let orders = await db.get()
          .collection(collection.ORDER_COLLECTION)
          .find({ userId: new ObjectId(userId) })
          .sort({ date: -1 })
          .toArray();

        for (let order of orders) {
          if (order.date) {
            try {
              const d = new Date(order.date);
              order.formattedDate = d.toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
            } catch (e) {
              order.formattedDate = String(order.date);
            }
          }

          if (order._id) {
            order.orderCode = order._id.toString().slice(-6).toUpperCase();
          }

          let calculatedTotal = 0;
          let populatedProducts = [];

          if (order.products && Array.isArray(order.products)) {
            for (let p of order.products) {
              let prod = null;
              let prodId = null;

              if (typeof p === 'object' && p !== null) {
                prodId = p.item || p._id || p.productId;
              } else {
                prodId = p;
              }

              if (prodId) {
                try {
                  prod = await db.get()
                    .collection(collection.PRODUCT_COLLECTION)
                    .findOne({ _id: new ObjectId(prodId) });
                } catch (e) {
                  try {
                    prod = await db.get()
                      .collection(collection.PRODUCT_COLLECTION)
                      .findOne({ _id: prodId });
                  } catch (err2) { }
                }
              }

              let name = (p && p.name) ? p.name : (prod ? prod.name : 'Stationery Item');
              let price = 0;
              if (p && p.price !== undefined && p.price !== null) {
                price = Number(p.price) || 0;
              } else if (prod && prod.price !== undefined && prod.price !== null) {
                price = Number(prod.price) || 0;
              }

              let qty = (p && p.quantity) ? (Number(p.quantity) || 1) : 1;
              let itemTotal = (p && p.itemTotal) ? (Number(p.itemTotal) || (price * qty)) : (price * qty);
              calculatedTotal += itemTotal;

              let imageSrc = '/img/no-image.png';
              let rawImages = (p && p.images && p.images.length) ? p.images : (prod ? prod.images : null);
              if (rawImages) {
                let firstImg = Array.isArray(rawImages) ? rawImages[0] : rawImages;
                if (firstImg && typeof firstImg === 'string' && firstImg.trim().length > 0) {
                  if (firstImg.startsWith('http')) {
                    imageSrc = firstImg;
                  } else {
                    imageSrc = '/product-images/' + firstImg;
                  }
                }
              }

              populatedProducts.push({
                name,
                price,
                quantity: qty,
                itemTotal,
                brand: (p && p.brand) || (prod ? prod.brand : '') || '',
                imageSrc
              });
            }
          }

          order.products = populatedProducts;
          order.totalAmount = (order.totalAmount !== undefined && order.totalAmount !== null && order.totalAmount > 0) ? Number(order.totalAmount) : calculatedTotal;
        }

        resolve(orders);
      } catch (err) {
        console.log("getOrders error:", err);
        reject(err);
      }

    })

  },

  // Save a failed payment attempt for audit/tracking
  saveFailedPayment: (userId, razorpayOrderId, razorpayPaymentId, reason) => {
    return new Promise(async (resolve, reject) => {
      try {
        await db.get()
          .collection('failed_payments')
          .insertOne({
            userId: new ObjectId(userId),
            razorpayOrderId: razorpayOrderId || null,
            razorpayPaymentId: razorpayPaymentId || null,
            reason: reason || 'Unknown',
            date: new Date()
          });
        resolve();
      } catch (err) {
        console.log('saveFailedPayment error:', err);
        reject(err);
      }
    });
  },

  // Update order fields by razorpayOrderId (used by webhook)
  updateOrderByRazorpayOrderId: (razorpayOrderId, updateFields) => {
    return new Promise(async (resolve, reject) => {
      try {
        // Try matching by razorpayOrderId first
        let result = await db.get()
          .collection(collection.ORDER_COLLECTION)
          .updateOne(
            { razorpayOrderId: razorpayOrderId },
            { $set: updateFields }
          );

        // Fallback: match by paymentId (for refund events)
        if (result.matchedCount === 0) {
          await db.get()
            .collection(collection.ORDER_COLLECTION)
            .updateOne(
              { paymentId: razorpayOrderId },
              { $set: updateFields }
            );
        }

        resolve();
      } catch (err) {
        console.log('updateOrderByRazorpayOrderId error:', err);
        reject(err);
      }
    });
  },

  // Get ALL orders (for admin panel)
  getAllOrders: () => {
    return new Promise(async (resolve, reject) => {
      try {
        let orders = await db.get()
          .collection(collection.ORDER_COLLECTION)
          .find({})
          .sort({ date: -1 })
          .toArray();

        // Batch-fetch customer emails for all orders
        const userIds = [...new Set(
          orders
            .map(o => o.userId)
            .filter(id => id)
            .map(id => {
              try { return new ObjectId(id); } catch { return null; }
            })
            .filter(Boolean)
        )];

        const emailMap = new Map();
        if (userIds.length > 0) {
          const users = await db.get()
            .collection(collection.USER_COLLECTION)
            .find({ _id: { $in: userIds } }, { projection: { email: 1 } })
            .toArray();
          users.forEach(u => {
            if (u.email) emailMap.set(u._id.toString(), u.email);
          });
        }

        for (let order of orders) {
          if (order.userId) {
            order.customerEmail = emailMap.get(order.userId.toString()) || '';
          }
          if (order.date) {
            try {
              const d = new Date(order.date);
              order.formattedDate = d.toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
              });
            } catch (e) {
              order.formattedDate = String(order.date);
            }
          }
          if (order._id) {
            order.orderCode = order._id.toString().slice(-6).toUpperCase();
          }
          // Compute total from stored products
          if (order.products && Array.isArray(order.products)) {
            let total = 0;
            order.products.forEach(p => { total += Number(p.itemTotal) || 0; });
            if (!order.totalAmount || order.totalAmount === 0) order.totalAmount = total;
          }
          order.isOnline = order.paymentMethod === 'ONLINE';
          order.isPaid = order.paymentStatus === 'Paid';
          order.isRefunded = order.paymentStatus === 'Refunded';
          order.canRefund = order.isOnline && order.isPaid && !order.isRefunded;
        }

        resolve(orders);
      } catch (err) {
        console.log('getAllOrders error:', err);
        reject(err);
      }
    });
  },

  // Update order status by orderId string (admin action)
  updateOrderStatus: (orderId, status) => {
    return new Promise(async (resolve, reject) => {
      try {
        await db.get()
          .collection(collection.ORDER_COLLECTION)
          .updateOne(
            { _id: new ObjectId(orderId) },
            { $set: { status: status } }
          );
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  },

  // Create a password reset token and store it in the user document
  createPasswordResetToken: (email) => {
    return new Promise(async (resolve, reject) => {
      try {
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

        const result = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOneAndUpdate(
            { email: email.trim().toLowerCase() },
            { $set: { resetToken: token, resetTokenExpiry: expiry } },
            { returnDocument: 'after' }
          );

        if (!result) {
          return resolve(null); // Email not found — don't reveal this to the user for security
        }

        resolve(token);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Find a user by a valid (non-expired) reset token
  findUserByResetToken: (token) => {
    return new Promise(async (resolve, reject) => {
      try {
        const user = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: new Date() } // token must not be expired
          });

        resolve(user || null);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Update the password and clear the reset token
  resetPassword: (token, newPassword) => {
    return new Promise(async (resolve, reject) => {
      try {
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await db.get()
          .collection(collection.USER_COLLECTION)
          .updateOne(
            {
              resetToken: token,
              resetTokenExpiry: { $gt: new Date() }
            },
            {
              $set: { password: hashedPassword },
              $unset: { resetToken: '', resetTokenExpiry: '' }
            }
          );

        resolve(result.modifiedCount > 0);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Verify email token
  verifyEmailToken: (token) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (typeof token !== 'string' || !token) return resolve(false);

        const result = await db.get()
          .collection(collection.USER_COLLECTION)
          .updateOne(
            {
              verificationToken: token,
              verificationTokenExpiry: { $gt: new Date() }
            },
            {
              $set: { isVerified: true },
              $unset: { verificationToken: '', verificationTokenExpiry: '' }
            }
          );

        resolve(result.modifiedCount > 0);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Resend verification token for unverified user
  resendVerificationToken: (email) => {
    return new Promise(async (resolve, reject) => {
      try {
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const result = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOneAndUpdate(
            { email: email.trim().toLowerCase(), isVerified: false },
            { $set: { verificationToken: token, verificationTokenExpiry: expiry } },
            { returnDocument: 'after' }
          );

        resolve(result ? token : null);
      } catch (err) {
        reject(err);
      }
    });
  },

  // Get live stats for admin dashboard
  getDashboardStats: () => {
    return new Promise(async (resolve, reject) => {
      try {
        const database = db.get();
        const [totalProducts, totalUsers, orders] = await Promise.all([
          database.collection(collection.PRODUCT_COLLECTION).countDocuments(),
          database.collection(collection.USER_COLLECTION).countDocuments(),
          database.collection(collection.ORDER_COLLECTION).find({}).sort({ date: -1 }).toArray()
        ]);

        let totalRevenue = 0;
        let paidOrders = 0;
        let pendingOrders = 0;

        // Build last 7 days map for revenue chart
        const dayMap = new Map();
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setHours(0, 0, 0, 0);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          const label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
          dayMap.set(key, { label, revenue: 0 });
        }

        orders.forEach(order => {
          const amount = Number(order.totalAmount) || 0;
          const isExcluded =
            order.status === 'Cancelled' ||
            order.status === 'Refunded' ||
            order.paymentStatus === 'Refunded';

          if (!isExcluded) {
            totalRevenue += amount;
            if (order.date) {
              const d = new Date(order.date);
              if (!isNaN(d.getTime())) {
                const key = d.toISOString().slice(0, 10);
                if (dayMap.has(key)) {
                  dayMap.get(key).revenue += amount;
                }
              }
            }
          }

          if (order.paymentStatus === 'Paid') paidOrders++;
          if (order.status === 'Placed' || order.status === 'Pending') pendingOrders++;
        });

        const recentActivity = orders.slice(0, 5).map(order => {
          const d = order.date ? new Date(order.date) : null;
          const formattedDate = d && !isNaN(d.getTime())
            ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : 'N/A';

          return {
            orderCode: order._id ? order._id.toString().slice(-6).toUpperCase() : 'N/A',
            customerName: order.deliveryDetails?.fullName || 'Customer',
            amount: (Number(order.totalAmount) || 0).toLocaleString('en-IN'),
            status: order.status || 'Placed',
            paymentStatus: order.paymentStatus || 'Pending',
            formattedDate
          };
        });

        const chartLabels = Array.from(dayMap.values()).map(v => v.label);
        const chartData = Array.from(dayMap.values()).map(v => v.revenue);

        resolve({
          totalRevenue: totalRevenue.toLocaleString('en-IN'),
          totalOrders: orders.length.toLocaleString('en-IN'),
          totalProducts: totalProducts.toLocaleString('en-IN'),
          totalUsers: totalUsers.toLocaleString('en-IN'),
          paidOrders,
          pendingOrders,
          recentActivity,
          chartLabelsJson: JSON.stringify(chartLabels),
          chartDataJson: JSON.stringify(chartData)
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  // Get ALL users with order count & total spent (for admin panel)
  getAllUsers: () => {
    return new Promise(async (resolve, reject) => {
      try {
        const database = db.get();
        const [users, orderStats] = await Promise.all([
          database.collection(collection.USER_COLLECTION)
            .find({}, { projection: { password: 0, resetToken: 0, resetTokenExpiry: 0, verificationToken: 0, verificationTokenExpiry: 0 } })
            .sort({ _id: -1 })
            .toArray(),
          database.collection(collection.ORDER_COLLECTION)
            .aggregate([
              {
                $group: {
                  _id: '$userId',
                  orderCount: { $sum: 1 },
                  totalSpent: {
                    $sum: {
                      $cond: [
                        { $in: ['$status', ['Cancelled', 'Refunded']] },
                        0,
                        { $ifNull: ['$totalAmount', 0] }
                      ]
                    }
                  }
                }
              }
            ])
            .toArray()
        ]);

        const statsMap = new Map();
        orderStats.forEach(s => {
          if (s._id) {
            statsMap.set(s._id.toString(), {
              orderCount: s.orderCount || 0,
              totalSpent: s.totalSpent || 0
            });
          }
        });

        const formattedUsers = users.map(u => {
          const stat = statsMap.get(u._id.toString()) || { orderCount: 0, totalSpent: 0 };
          const fullName = u.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'User';
          const joinedDate = u._id.getTimestamp().toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
          });

          return {
            _id: u._id,
            userCode: u._id.toString().slice(-6).toUpperCase(),
            fullName,
            email: u.email,
            isVerified: u.isVerified !== false,
            addressCount: Array.isArray(u.addresses) ? u.addresses.length : 0,
            orderCount: stat.orderCount,
            totalSpent: stat.totalSpent.toLocaleString('en-IN'),
            joinedDate
          };
        });

        resolve(formattedUsers);
      } catch (err) {
        console.log('getAllUsers error:', err);
        reject(err);
      }
    });
  },

  // Get site settings from DB (with defaults)
  getSiteSettings: () => {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = await db.get()
          .collection('settings')
          .findOne({ _id: 'site_settings' });

        resolve({
          storeName: doc?.storeName || 'CraftDesk Store',
          bannerText: doc?.bannerText || 'Free Shipping on orders above ₹999 • Exclusive Deals Everyday',
          freeShippingThreshold: doc?.freeShippingThreshold ?? 999,
          supportEmail: doc?.supportEmail || process.env.GMAIL_USER || '',
          codEnabled: doc?.codEnabled !== false
        });
      } catch (err) {
        reject(err);
      }
    });
  },

  // Save site settings to DB
  updateSiteSettings: (data) => {
    return new Promise(async (resolve, reject) => {
      try {
        const threshold = Number(data.freeShippingThreshold);
        const updateDoc = {
          storeName: typeof data.storeName === 'string' && data.storeName.trim() ? data.storeName.trim() : 'CraftDesk Store',
          bannerText: typeof data.bannerText === 'string' ? data.bannerText.trim() : '',
          freeShippingThreshold: !isNaN(threshold) && threshold >= 0 ? threshold : 999,
          supportEmail: typeof data.supportEmail === 'string' ? data.supportEmail.trim() : '',
          codEnabled: data.codEnabled === 'on' || data.codEnabled === true,
          updatedAt: new Date()
        };

        await db.get()
          .collection('settings')
          .updateOne(
            { _id: 'site_settings' },
            { $set: updateDoc },
            { upsert: true }
          );

        resolve(updateDoc);
      } catch (err) {
        reject(err);
      }
    });
  }


}
