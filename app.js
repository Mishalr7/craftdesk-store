var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const session = require('express-session')

var userRouter = require('./routes/user');
var adminRouter = require('./routes/admin');
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
    startsWith: (value, text) => value?.startsWith(text)
  }
}));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
db.connect((err)=>{
  if(err) console.log("Connection Error",err);
  else console.log("Database Connected");
});
app.use(session({
  secret: 'craftdesk-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}))

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.loggedIn = req.session.loggedIn;
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
