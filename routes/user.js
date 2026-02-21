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

router.get('/', (req, res) => {
  productHelpers.getAllProducts()
    .then((products) => {
      res.render('index', {
        title: 'CraftDesk Store',
        products
      });
    })
    .catch(err => {
      console.log(err);
      res.send("Error loading products");
    });
});

router.get('/account', verifyLogin, (req, res) => {
  res.render('user/account');
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

router.get('/cart', async (req, res) => {

  const cart = req.session.cart || [];

  let cartProducts = [];
  let subtotal=0;

  for (let item of cart) {
    const product = await productHelpers.getProductById(item.productId);

if (product) {
       const itemTotal = product.price * item.quantity;

      subtotal += itemTotal;
  cartProducts.push({
    ...product,
    quantity: item.quantity,
    itemTotal
  });
}
  }

  res.render('user/cart', {
    cartProducts,
    subtotal,
    loggedIn: req.session.loggedIn
  });
});

router.get('/add-to-cart/:id', async (req, res) => {

  const productId = req.params.id;

  if (!req.session.cart) {
    req.session.cart = [];
  }

  const existingItem = req.session.cart.find(p => p.productId === productId);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    req.session.cart.push({
      productId,
      quantity: 1
    });
  }

res.redirect(req.get("Referrer") || "/");
});

router.get('/checkout', verifyLogin, (req, res) => {
  res.render('user/checkout');
});
router.get('/change-quantity/:id/:action', (req, res) => {

  const productId = req.params.id;
  const action = req.params.action;

  const cart = req.session.cart || [];

  const item = cart.find(p => p.productId === productId);

  if (item) {
    if (action === 'increase') {
      item.quantity += 1;
    }

    if (action === 'decrease') {
      if (item.quantity > 1) {
        item.quantity -= 1;
      }
    }
  }

  res.redirect('/cart');
});

router.get('/blog', (req, res) => {
  res.render('user/blog');
});


module.exports = router;
