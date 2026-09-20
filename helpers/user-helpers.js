const db = require('../config/connection')
const collection = require('../config/collections')
const bcrypt = require('bcrypt')
const { ObjectId } = require('mongodb')

module.exports = {
   
  // SIGNUP
doSignup: (userData) => {
  return new Promise(async (resolve, reject) => {

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{5,}$/;
    if (!passwordRegex.test(userData.password)) {
      return reject("Password must contain at least 1 letter and 1 number and be 5 characters long");
    }

    try {
      const existingUser = await db.get()
        .collection(collection.USER_COLLECTION)
        .findOne({ email: userData.email });

      if (existingUser) {
        return reject("Email already registered");
      }
      delete userData.confirmPassword;
      userData.password = await bcrypt.hash(userData.password, 10);
      userData.addresses = []
      userData.defaultAddressId = null
      const result = await db.get()
        .collection(collection.USER_COLLECTION)
        .insertOne(userData);

      resolve(result.insertedId);

    } catch (err) {
      reject("Signup failed. Please try again.");
    }
  });
},

  // LOGIN
  doLogin: (userData) => {
    return new Promise(async (resolve, reject) => {
      try {
        const user = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOne({ email: userData.email })

        if (!user) {
          return resolve({ status: false })
        }

        const match = await bcrypt.compare(userData.password, user.password)

        if (match) {
          resolve({ user, status: true })
        } else {
          resolve({ status: false })
        }

      } catch (err) {
        reject(err)
      }
    })
  }
  ,
  addToCart:(prodId,userId)=>{

  return new Promise(async(resolve,reject)=>{

    let userCart = await db.get()
    .collection(collection.CART_COLLECTION)
    .findOne({ user: new ObjectId(userId) })

    if(userCart){

      let productExist = userCart.products.findIndex(
        product => product.item == prodId
      )

      if(productExist != -1){

        await db.get()
        .collection(collection.CART_COLLECTION)
        .updateOne(
          {
            user:new ObjectId(userId),
            'products.item':new ObjectId(prodId)
          },
          {
            $inc:{ 'products.$.quantity':1 }
          }
        )

      }else{

        await db.get()
        .collection(collection.CART_COLLECTION)
        .updateOne(
          { user:new ObjectId(userId) },
          {
            $push:{
              products:{
                item:new ObjectId(prodId),
                quantity:1
              }
            }
          }
        )

      }

      resolve()

    }else{

      let cartObj = {

        user:new ObjectId(userId),

        products:[
          {
            item:new ObjectId(prodId),
            quantity:1
          }
        ]

      }

      await db.get()
      .collection(collection.CART_COLLECTION)
      .insertOne(cartObj)

      resolve()

    }

  })

},
getCartProducts:(userId)=>{

  return new Promise(async(resolve,reject)=>{

    let cart = await db.get()
    .collection(collection.CART_COLLECTION)
    .aggregate([

      {
        $match:{
          user:new ObjectId(userId)
        }
      },

      {
        $unwind:'$products'
      },

      {
        $project:{
          item:'$products.item',
          quantity:'$products.quantity'
        }
      },

      {
        $lookup:{
          from:'products',
          localField:'item',
          foreignField:'_id',
          as:'product'
        }
      },

      {
        $project:{
          quantity:1,
          product:{ $arrayElemAt:['$product',0] }
        }
      }

    ]).toArray()

    resolve(cart)

  })

},
getCartCount:(userId)=>{

  return new Promise(async(resolve,reject)=>{

    let count = 0

    let cart = await db.get()
    .collection(collection.CART_COLLECTION)
    .findOne({ user:new ObjectId(userId) })

    if(cart){

      cart.products.forEach(item=>{

        count += item.quantity

      })

    }

    resolve(count)

  })

},
changeProductQuantity:(userId,productId,action)=>{

  return new Promise(async(resolve,reject)=>{

    let cart = await db.get()
    .collection(collection.CART_COLLECTION)
    .findOne({
      user:new ObjectId(userId)
    })

    let product = cart.products.find(
      p => p.item.toString() === productId
    )

    if(action === 'decrease' && product.quantity === 1){

      await db.get()
      .collection(collection.CART_COLLECTION)
      .updateOne(

        { user:new ObjectId(userId) },

        {
          $pull:{
            products:{
              item:new ObjectId(productId)
            }
          }
        }

      )

    }else{

      let count = action === 'increase' ? 1 : -1

      await db.get()
      .collection(collection.CART_COLLECTION)
      .updateOne(

        {
          user:new ObjectId(userId),
          'products.item':new ObjectId(productId)
        },

        {
          $inc:{
            'products.$.quantity':count
          }
        }

      )

    }

    resolve()

  })

},
removeCartItem:(userId,productId)=>{

  return new Promise(async(resolve,reject)=>{

    await db.get()
    .collection(collection.CART_COLLECTION)
    .updateOne(

      {
        user:new ObjectId(userId)
      },

      {
        $pull:{
          products:{
            item:new ObjectId(productId)
          }
        }
      }

    )

    resolve()

  })

},
getAddresses:(userId)=>{

  return new Promise(async(resolve,reject)=>{

    let user = await db.get()
    .collection(collection.USER_COLLECTION)
    .findOne({

      _id:new ObjectId(userId)

    })

    resolve(user.addresses || [])

  })

},
addAddress:(userId,address)=>{

  return new Promise(async(resolve,reject)=>{

    address._id = new ObjectId()
    address.isDefault = false

    let user = await db.get()
    .collection(collection.USER_COLLECTION)
    .findOne({
      _id:new ObjectId(userId)
    })

    if(!user.addresses || user.addresses.length === 0){

      address.isDefault = true

    }

    await db.get()
    .collection(collection.USER_COLLECTION)
    .updateOne(
      {
        _id:new ObjectId(userId)
      },
      {
        $push:{
          addresses:address
        }
      }
    )

    resolve()

  })

},
setDefaultAddress:(userId,addressId)=>{

  return new Promise(async(resolve,reject)=>{

    await db.get()
    .collection(collection.USER_COLLECTION)
    .updateOne(
      {
        _id:new ObjectId(userId)
      },
      {
        $set:{
          'addresses.$[].isDefault':false
        }
      }
    )

    await db.get()
    .collection(collection.USER_COLLECTION)
    .updateOne(
      {
        _id:new ObjectId(userId),
        'addresses._id':new ObjectId(addressId)
      },
      {
        $set:{
          'addresses.$.isDefault':true
        }
      }
    )

    resolve()

  })

},
deleteAddress:(userId,addressId)=>{

  return new Promise(async(resolve,reject)=>{

    await db.get()
    .collection(collection.USER_COLLECTION)
    .updateOne(
      {
        _id:new ObjectId(userId)
      },
      {
        $pull:{
          addresses:{
            _id:new ObjectId(addressId)
          }
        }
      }
    )

    resolve()

  })

},
placeOrder:(userId,addressId,paymentMethod,paymentId=null,razorpayOrderId=null)=>{

  return new Promise(async(resolve,reject)=>{

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

getOrders:(userId)=>{

  return new Promise(async(resolve,reject)=>{

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
                } catch (err2) {}
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

}


}
