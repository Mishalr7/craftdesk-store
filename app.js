require('dotenv').config({ quiet: true });
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const { doubleCsrf } = require('csrf-csrf');

var userRouter = require('./routes/user');
var adminRouter = require('./routes/admin');
const productHelpers = require('./helpers/product-helpers');
const userHelpers = require('./helpers/user-helpers');
const { engine } = require('express-handlebars');
var app = express();
var db = require('./config/connection');
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.engine('hbs', engine({
  extname: '.hbs',
  defaultLayout: 'layout',
  layoutsDir: path.join(__dirname, 'views/layout'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    eq: (a, b) => a === b,
    startsWith: (value, text) => value?.startsWith(text),
    multiply: (a, b) => a * b,
    encodeURIComponent: (val) => encodeURIComponent(val || '')
  }
}));

app.use(logger('dev'));
// Keep raw body for Razorpay webhook signature verification
app.use((req, res, next) => {
  if (req.path === '/razorpay-webhook') return next();
  express.json()(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/razorpay-webhook') return next();
  express.urlencoded({ extended: false })(req, res, next);
});
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
db.connect((err)=>{
  if(err) console.log("Connection Error",err);
  else console.log("Database Connected");
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'craftdesk-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: 'mongodb://localhost:27017/craftdesk-store',
    collectionName: 'sessions',
    ttl: 60 * 60 * 24 * 7 // 7 days in seconds
  }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}))

// CSRF Protection for auth forms (login, signup, forgot, reset-password)
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'craftdesk-csrf-secret',
  getSessionIdentifier: (req) => req.session?.user?._id?.toString() || 'guest',
  cookieName: process.env.NODE_ENV === 'production' ? '__Host-psifi.x-csrf-token' : 'psifi.x-csrf-token',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  },
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getCsrfTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token'],
});

const csrfAuthPaths = ['/login', '/signup', '/forgot', '/resend-verification', '/admin/login'];
app.use((req, res, next) => {
  if (csrfAuthPaths.includes(req.path) || req.path.startsWith('/reset-password')) {
    return doubleCsrfProtection(req, res, next);
  }
  next();
});

app.use((req, res, next) => {
  res.locals.csrfToken = generateCsrfToken(req, res);
  next();
});


app.use(async (req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.loggedIn = req.session.loggedIn;
  try {
    if (req.session?.loggedIn && req.session?.user?._id) {
      res.locals.cartCount = await userHelpers.getCartCount(req.session.user._id);
    } else {
      res.locals.cartCount = 0;
    }
  } catch (e) {
    res.locals.cartCount = 0;
  }
  try {
    res.locals.categories = await productHelpers.getAllCategories();
  } catch (e) {
    res.locals.categories = [];
  }
  // Prevent browsers from caching dynamic pages with stale cart counts
  if (req.method === 'GET' && !req.path.startsWith('/stylesheets') && !req.path.startsWith('/javascripts') && !req.path.startsWith('/product-images') && !req.path.startsWith('/images')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  }
  next();
});



app.use('/', userRouter);
app.use('/admin', adminRouter);
// 404 Handler (Page Not Found)
app.use((req, res) => {
  res.status(404);
  res.render('404');
});




// error handler
app.use(function (err, req, res, next) {
  console.error(err.stack);   // You still see real error in terminal

  res.status(err.status || 500);
  res.render('error', {
    status: err.status || 500,
    message: "Something broke... we're fixing it!"
  });
});




module.exports = app;
