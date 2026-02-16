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
router.get('/account', (req, res) => {
  if (req.session.loggedIn) {
    res.render('user/account', { user: req.session.user })
  } else {
    res.redirect('/login')
  }
})



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
router.get('/cart',(req,res)=>{
  res.render('user/cart')
})


module.exports = router;
