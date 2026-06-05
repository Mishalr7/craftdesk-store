var express = require('express');
var router = express.Router();
const productHelpers = require('../helpers/product-helpers');
const userHelpers = require('../helpers/user-helpers');

function verifyLogin(req,res,next){
  if(req.session.loggedIn){
    next();
  }else{
    res.redirect('/login');
  }
}

router.get('/', async (req, res) => {

  let cartCount = 0

  if(req.session.loggedIn){

    cartCount = await userHelpers.getCartCount(
      req.session.user._id
    )

  }

  productHelpers.getAllProducts()
    .then((products) => {

      res.render('index', {

        title: 'CraftDesk Store',

        products,

        user:req.session.user,

        cartCount

      })

    })
    .catch(err => {

      console.log(err)

      res.send("Error loading products")

    })

});

router.get('/account', verifyLogin, async (req, res) => {

  let cartCount = await userHelpers.getCartCount(
    req.session.user._id
  )

  res.render('user/account',{

    user:req.session.user,
    cartCount

  })

});

router.get('/logout', (req, res) => {
  req.session.destroy()
  res.redirect('/')
})

router.get('/login', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/account')
  } else {
    res.render('user/login')
  }
});

router.get('/signup', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/account')
  } else {
    res.render('user/signup')
  }
});



router.post('/signup', (req, res) => {
userHelpers.doSignup(req.body)
  .then((userId) => {
    req.session.user = {
      _id: userId,
      email: req.body.email
    }
    req.session.loggedIn = true
    res.redirect('/account')
  })
  .catch(err => {
    res.render('user/signup', { signupError: err })
  })

})

router.post('/login', (req, res) => {
  userHelpers.doLogin(req.body)
    .then((response) => {

      if (response.status) {
        req.session.user = response.user
        req.session.loggedIn = true
        res.redirect('/account')
      } else {
        res.render('user/login', { loginError: true })
      }

    })
    .catch(err => {
      console.log(err)
      res.render('user/login', { loginError: true })
    })
})

router.get('/cart', verifyLogin, async (req,res)=>{

  let cartProducts = await userHelpers.getCartProducts(
    req.session.user._id
  )

  let subtotal = 0

  cartProducts.forEach(item=>{

    item.itemTotal =
      item.quantity * item.product.price

    subtotal += item.itemTotal

  })

let cartCount = await userHelpers.getCartCount(
  req.session.user._id
)

res.render('user/cart',{

  cartProducts,
  subtotal,
  loggedIn:true,
  user:req.session.user,
  cartCount

})

})

router.get('/add-to-cart/:id', verifyLogin, (req,res)=>{

  userHelpers.addToCart(
    req.params.id,
    req.session.user._id
  ).then(()=>{

    res.json({
      status:true
    })

  })

})

router.get('/change-quantity/:id/:action', verifyLogin, async (req,res)=>{

  await userHelpers.changeProductQuantity(

    req.session.user._id,
    req.params.id,
    req.params.action

  )

  res.redirect('/cart')

})

router.get('/checkout', verifyLogin, async (req, res) => {

  let addresses =
    await userHelpers.getAddresses(
      req.session.user._id
    )

  let cartProducts =
    await userHelpers.getCartProducts(
      req.session.user._id
    )

  let subtotal = 0

  cartProducts.forEach(item => {

    item.itemTotal =
      item.quantity * item.product.price

    subtotal += item.itemTotal

  })

  res.render('user/checkout', {

    user:req.session.user,
    addresses,
    subtotal

  })

})

router.get('/blog', (req, res) => {
  res.render('user/blog');
});

router.get('/remove-cart-item/:id', verifyLogin, async (req,res)=>{

  await userHelpers.removeCartItem(

    req.session.user._id,
    req.params.id

  )

  res.redirect('/cart')

});

router.get('/addresses',verifyLogin,async(req,res)=>{

  let addresses =
    await userHelpers.getAddresses(
      req.session.user._id
    )

  res.render('user/addresses',{

    user:req.session.user,
    addresses

  })

});

router.get('/add-address',verifyLogin,(req,res)=>{

  res.render('user/add-address',{

    user:req.session.user

  })

});
router.post('/add-address',verifyLogin,async(req,res)=>{

  const fullName = req.body.fullName.trim()
const phone = req.body.phone.trim()
const address = req.body.address.trim()
const city = req.body.city.trim()
const state = req.body.state.trim()
const pincode = req.body.pincode.trim()

  const phoneRegex = /^[0-9]{10}$/
  const pinRegex = /^[0-9]{6}$/
  const nameRegex = /^[A-Za-z.\- ]{3,50}$/
  const cityStateRegex = /^[A-Za-z.\- ]{2,50}$/

  const allowedStates = [
  'Kerala',
  'Tamil Nadu',
  'Karnataka',
  'Andhra Pradesh',
  'Telangana',
  'Puducherry'
]



if(!nameRegex.test(fullName)){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Invalid Full Name'
  })
}

if(!phoneRegex.test(phone)){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Invalid Phone Number'
  })
}

if(!pinRegex.test(pincode)){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Invalid PIN Code'
  })
}

if(address.trim().length < 10){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Address is too short'
  })
}

if(!cityStateRegex.test(city)){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Invalid City'
  })
}

if(!cityStateRegex.test(state)){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Invalid State'
  })
}
if(!allowedStates.includes(state)){
  return res.render('user/add-address',{
    user:req.session.user,
    addressError:'Sorry, we currently do not deliver to this location.'
  })
}
  await userHelpers.addAddress(
  req.session.user._id,
  {
    fullName,
    phone,
    address,
    city,
    state,
    pincode
  }
)

  res.redirect('/addresses')

});
router.get(
  '/set-default-address/:id',
  verifyLogin,
  async(req,res)=>{

    await userHelpers.setDefaultAddress(
      req.session.user._id,
      req.params.id
    )

    res.redirect('/addresses')

});
router.get(
  '/delete-address/:id',
  verifyLogin,
  async(req,res)=>{

    await userHelpers.deleteAddress(
      req.session.user._id,
      req.params.id
    )

    res.redirect('/addresses')

});
router.post('/place-order', verifyLogin, async(req,res)=>{

  try{

    await userHelpers.placeOrder(
      req.session.user._id,
      req.body.addressId,
      req.body.paymentMethod
    )

    res.redirect('/order-success')

  }catch(err){

    console.log(err)

    res.redirect('/cart')

  }

});

router.get(
  '/order-success',
  verifyLogin,
  (req,res)=>{

    res.render(
      'user/order-success'
    )

});
router.get(
  '/my-orders',
  verifyLogin,
  async(req,res)=>{

    let orders =
      await userHelpers.getOrders(
        req.session.user._id
      )

    res.render(
      'user/my-orders',
      {
        orders,
        user:req.session.user
      }
    )

});
router.get(
  '/my-orders',
  verifyLogin,
  async(req,res)=>{

    let orders =
      await userHelpers.getOrders(
        req.session.user._id
      )

    res.render(
      'user/my-orders',
      {
        user:req.session.user,
        orders
      }
    )

});



module.exports = router;
