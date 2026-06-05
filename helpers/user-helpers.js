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
placeOrder:(userId,addressId,paymentMethod)=>{

  return new Promise(async(resolve,reject)=>{

    let user =
      await db.get()
      .collection(collection.USER_COLLECTION)
      .findOne({
        _id:new ObjectId(userId)
      })

let cart = await db.get()
.collection(collection.CART_COLLECTION)
.findOne({
  user:new ObjectId(userId)
})

if(!cart){
  return reject('Cart is empty')
}

    let address =
      user.addresses.find(
        a => a._id.toString() === addressId
      )

    let orderObj = {

      userId:new ObjectId(userId),

      deliveryDetails:{

        fullName:address.fullName,
        phone:address.phone,
        address:address.address,
        city:address.city,
        state:address.state,
        pincode:address.pincode

      },

      paymentMethod,

      products:cart.products,

      status:
        paymentMethod === 'COD'
        ? 'Placed'
        : 'Pending',

      date:new Date()

    }

    await db.get()
    .collection(collection.ORDER_COLLECTION)
    .insertOne(orderObj)

    await db.get()
    .collection(collection.CART_COLLECTION)
    .deleteOne({
      user:new ObjectId(userId)
    })

    resolve()

  })

},

getOrders:(userId)=>{

  return new Promise(async(resolve,reject)=>{

    let orders =
      await db.get()
      .collection(collection.ORDER_COLLECTION)
      .find({

        userId:new ObjectId(userId)

      })
      .sort({date:-1})
      .toArray()

    resolve(orders)

  })

},


}
