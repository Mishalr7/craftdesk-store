var express = require('express');
var router = express.Router();
const productHelpers = require('../helpers/product-helpers');
const userHelpers = require('../helpers/user-helpers');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

// Rate limiter: max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter: max 5 signup attempts per 15 minutes per IP
const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many signup attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

function verifyLogin(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

router.get('/', async (req, res) => {

  let cartCount = 0

  if (req.session.loggedIn) {

    cartCount = await userHelpers.getCartCount(
      req.session.user._id
    )

  }

  const searchQuery = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
  const sort = typeof req.query.sort === 'string' ? req.query.sort.trim() : '';
  const offersOnly = req.query.offers === 'true';

  let pageTitle = 'Featured Products';
  let isFiltered = false;
  let activeNav = 'home';

  if (searchQuery) {
    pageTitle = `Search results for "${searchQuery}"`;
    isFiltered = true;
    activeNav = '';
  } else if (offersOnly) {
    pageTitle = 'Special Offers & Deals';
    isFiltered = true;
    activeNav = 'offers';
  } else if (category) {
    pageTitle = category;
    isFiltered = true;
    activeNav = 'categories';
  } else if (sort === 'newest') {
    pageTitle = 'New Arrivals';
    isFiltered = true;
    activeNav = 'new-arrivals';
  }

  const productPromise = searchQuery
    ? productHelpers.searchProducts(searchQuery)
    : productHelpers.getAllProducts({ category, offersOnly, sort });

  productPromise
    .then((products) => {

      res.render('index', {

        title: 'CraftDesk Store',

        products,

        searchQuery,

        pageTitle,

        isFiltered,

        activeNav,

        user: req.session.user,

        cartCount

      })

    })
    .catch(err => {

      console.log(err)

      res.send("Error loading products")

    })

});

router.get('/product/:id', async (req, res) => {
  try {
    const product = await productHelpers.getProductById(req.params.id);
    if (!product) {
      return res.status(404).render('404');
    }

    let cartCount = 0;
    let inCartQty = 0;
    if (req.session.loggedIn) {
      cartCount = await userHelpers.getCartCount(req.session.user._id);
      const cartProducts = await userHelpers.getCartProducts(req.session.user._id);
      const matched = cartProducts.find(item => item.product && item.product._id.toString() === product._id.toString());
      if (matched) inCartQty = Number(matched.quantity) || 0;
    }

    let relatedProducts = [];
    if (product.category) {
      const sameCategory = await productHelpers.getAllProducts({ category: product.category });
      relatedProducts = sameCategory
        .filter(p => p._id.toString() !== product._id.toString())
        .slice(0, 4);
    }

    res.render('user/product-detail', {
      title: product.name + ' - CraftDesk Store',
      product,
      relatedProducts,
      inCartQty,
      user: req.session.user,
      cartCount
    });
  } catch (err) {
    console.error('Product detail error:', err);
    res.status(404).render('404');
  }
});

router.get('/account', verifyLogin, async (req, res) => {

  let cartCount = await userHelpers.getCartCount(
    req.session.user._id
  )

  res.render('user/account', {

    user: req.session.user,
    cartCount

  })

});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error:', err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
})

router.get('/login', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/account')
  } else {
    res.render('user/login', {
      resetSuccess: req.query.reset === 'success',
      verifySent: req.query.verify === 'sent',
      verifiedSuccess: req.query.verified === 'success',
      verifiedInvalid: req.query.verified === 'invalid'
    })
  }
});

router.get('/signup', (req, res) => {
  if (req.session.loggedIn) {
    res.redirect('/account')
  } else {
    res.render('user/signup')
  }
});

async function sendVerificationEmail(email, token) {
  const verifyUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email/${token}`;
  await sendEmail({
    to: email,
    subject: 'Verify your CraftDesk Store email',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
        <h2 style="color:#0d9488;">CraftDesk Store</h2>
        <p>Welcome to CraftDesk Store!</p>
        <p>Please verify your email address by clicking the button below. This link expires in <strong>24 hours</strong>.</p>
        <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0;">Verify Email</a>
        <p>If you didn't create this account, you can ignore this email.</p>
        <hr>
        <small style="color:#888;">CraftDesk Store</small>
      </div>
    `,
  });
}

router.post('/signup', signupLimiter, async (req, res) => {
  try {
    const { email, verificationToken } = await userHelpers.doSignup(req.body);
    await sendVerificationEmail(email, verificationToken);
    res.redirect('/login?verify=sent');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('user/signup', {
      signupError: typeof err === 'string' ? err : 'Signup failed. Please try again.'
    });
  }
});

router.get('/verify-email/:token', async (req, res) => {
  try {
    const verified = await userHelpers.verifyEmailToken(req.params.token);
    if (verified) {
      return res.redirect('/login?verified=success');
    }
    res.redirect('/login?verified=invalid');
  } catch (err) {
    console.error('Email verification error:', err);
    res.redirect('/login?verified=invalid');
  }
});

router.post('/resend-verification', signupLimiter, async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email) {
      const token = await userHelpers.resendVerificationToken(email);
      if (token) {
        await sendVerificationEmail(email, token);
      }
    }
    res.redirect('/login?verify=sent');
  } catch (err) {
    console.error('Resend verification error:', err);
    res.redirect('/login?verify=sent');
  }
});

router.post('/login', loginLimiter, (req, res) => {
  userHelpers.doLogin(req.body)
    .then((response) => {

      if (response.status) {
        req.session.user = response.user
        req.session.loggedIn = true
        res.redirect('/account')
      } else if (response.notVerified) {
        res.render('user/login', {
          notVerified: true,
          unverifiedEmail: response.email
        })
      } else {
        res.render('user/login', { loginError: true })
      }

    })
    .catch(err => {
      console.log(err)
      res.render('user/login', { loginError: true })
    })
})

router.get('/cart', verifyLogin, async (req, res) => {

  let cartProducts = await userHelpers.getCartProducts(
    req.session.user._id
  )

  let subtotal = 0

  cartProducts.forEach(item => {

    item.itemTotal =
      item.quantity * item.product.price

    subtotal += item.itemTotal

  })

  let cartCount = await userHelpers.getCartCount(
    req.session.user._id
  )

  res.render('user/cart', {

    cartProducts,
    subtotal,
    loggedIn: true,
    user: req.session.user,
    cartCount,
    stockError: req.query.stockError || null

  })

})

router.get('/cart-count', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (req.session?.loggedIn && req.session?.user?._id) {
      const cartCount = await userHelpers.getCartCount(req.session.user._id);
      let productQty = 0;
      if (req.query.productId) {
        const cartProducts = await userHelpers.getCartProducts(req.session.user._id);
        const matched = cartProducts.find(item => item.product && item.product._id.toString() === req.query.productId);
        if (matched) productQty = Number(matched.quantity) || 0;
      }
      return res.json({ cartCount, productQty });
    }
    res.json({ cartCount: 0, productQty: 0 });
  } catch (err) {
    res.json({ cartCount: 0, productQty: 0 });
  }
});

router.get('/add-to-cart/:id', verifyLogin, async (req, res) => {
  try {
    const result = await userHelpers.addToCart(req.params.id, req.session.user._id);
    const cartCount = await userHelpers.getCartCount(req.session.user._id);
    res.json({ ...(result || { status: true }), cartCount });
  } catch (err) {
    console.error('Add to cart error:', err);
    res.status(500).json({ status: false, message: 'Could not add item to cart.' });
  }
})

router.get('/change-quantity/:id/:action', verifyLogin, async (req, res) => {

  const result = await userHelpers.changeProductQuantity(

    req.session.user._id,
    req.params.id,
    req.params.action

  )

  if (req.query.ajax === '1') {
    const cartCount = await userHelpers.getCartCount(req.session.user._id);
    return res.json({
      status: result ? result.status !== false : true,
      message: result?.message || null,
      cartCount
    });
  }

  if (result && result.status === false && result.message) {
    return res.redirect('/cart?stockError=' + encodeURIComponent(result.message));
  }

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

    user: req.session.user,
    addresses,
    subtotal

  })

})

router.get('/blog', (req, res) => {
  res.render('user/blog', { activeNav: 'blog' });
});

router.get('/remove-cart-item/:id', verifyLogin, async (req, res) => {

  await userHelpers.removeCartItem(

    req.session.user._id,
    req.params.id

  )

  res.redirect('/cart')

});

router.get('/addresses', verifyLogin, async (req, res) => {

  let addresses =
    await userHelpers.getAddresses(
      req.session.user._id
    )

  res.render('user/addresses', {

    user: req.session.user,
    addresses

  })

});

router.get('/add-address', verifyLogin, (req, res) => {

  res.render('user/add-address', {

    user: req.session.user

  })

});
router.post('/add-address', verifyLogin, async (req, res) => {

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



  if (!nameRegex.test(fullName)) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Invalid Full Name'
    })
  }

  if (!phoneRegex.test(phone)) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Invalid Phone Number'
    })
  }

  if (!pinRegex.test(pincode)) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Invalid PIN Code'
    })
  }

  if (address.trim().length < 10) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Address is too short'
    })
  }

  if (!cityStateRegex.test(city)) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Invalid City'
    })
  }

  if (!cityStateRegex.test(state)) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Invalid State'
    })
  }
  if (!allowedStates.includes(state)) {
    return res.render('user/add-address', {
      user: req.session.user,
      addressError: 'Sorry, we currently do not deliver to this location.'
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
  async (req, res) => {

    await userHelpers.setDefaultAddress(
      req.session.user._id,
      req.params.id
    )

    res.redirect('/addresses')

  });
router.get(
  '/delete-address/:id',
  verifyLogin,
  async (req, res) => {

    await userHelpers.deleteAddress(
      req.session.user._id,
      req.params.id
    )

    res.redirect('/addresses')

  });
router.post('/place-order', verifyLogin, async (req, res) => {

  try {
    if (req.body.paymentMethod === 'COD') {
      const settings = await userHelpers.getSiteSettings();
      if (!settings.codEnabled) {
        return res.redirect('/checkout');
      }
    }

    await userHelpers.placeOrder(
      req.session.user._id,
      req.body.addressId,
      req.body.paymentMethod
    )

    res.redirect('/order-success')

  } catch (err) {

    console.log(err)

    res.redirect('/cart')

  }

});

router.get(
  '/order-success',
  verifyLogin,
  (req, res) => {

    res.render(
      'user/order-success'
    )

  });
router.get(
  '/my-orders',
  verifyLogin,
  async (req, res) => {

    let orders = await userHelpers.getOrders(
      req.session.user._id
    )

    let cartCount = await userHelpers.getCartCount(
      req.session.user._id
    )

    res.render('user/my-orders', {
      orders,
      user: req.session.user,
      cartCount
    })

  });

// Create Razorpay order
router.post('/create-razorpay-order', verifyLogin, async (req, res) => {
  try {
    let cartProducts = await userHelpers.getCartProducts(req.session.user._id);
    if (!cartProducts || cartProducts.length === 0) {
      return res.status(400).json({ success: false, message: 'Your cart is empty' });
    }

    let subtotal = 0;
    for (const item of cartProducts) {
      const prod = item.product;
      const qty = Number(item.quantity) || 1;
      if (!prod.stock || (typeof prod.stockCount === 'number' && prod.stockCount < qty)) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${prod.name}". Available: ${typeof prod.stockCount === 'number' ? prod.stockCount : 0}`
        });
      }
      subtotal += (Number(prod.price) || 0) * qty;
    }

    if (subtotal <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid cart total' });
    }

    const options = {
      amount: Math.round(subtotal * 100), // convert to paise
      currency: 'INR',
      receipt: 'rcpt_' + Date.now().toString().slice(-8)
    };

    const order = await razorpay.orders.create(options);
    res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      amount: subtotal
    });
  } catch (err) {
    console.error('Razorpay order creation error:', err);
    res.status(500).json({ success: false, message: 'Failed to create payment order' });
  }
});

// Verify Razorpay payment and place order
router.post('/verify-payment', verifyLogin, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addressId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !addressId) {
      return res.status(400).json({ success: false, message: 'Missing payment verification details' });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('Razorpay signature verification failed');
      // Record tampered/failed verification attempt
      await userHelpers.saveFailedPayment(
        req.session.user._id,
        razorpay_order_id,
        razorpay_payment_id,
        'Signature verification failed'
      );
      return res.status(400).json({ success: false, message: 'Payment verification failed' });
    }

    // Place order
    await userHelpers.placeOrder(
      req.session.user._id,
      addressId,
      'ONLINE',
      razorpay_payment_id,
      razorpay_order_id
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Payment verification error:', err);
    res.status(500).json({ success: false, message: 'Error processing order' });
  }
});

// Record payment failure (called from frontend when Razorpay payment.failed fires)
router.post('/payment-failed', verifyLogin, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, error_code, error_description, error_reason } = req.body;

    await userHelpers.saveFailedPayment(
      req.session.user._id,
      razorpay_order_id || null,
      razorpay_payment_id || null,
      error_description || error_reason || error_code || 'Payment failed'
    );

    res.json({ success: true });
  } catch (err) {
    console.error('payment-failed record error:', err);
    res.status(500).json({ success: false });
  }
});

// Razorpay Webhook — server-side event verification
router.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('RAZORPAY_WEBHOOK_SECRET not set — skipping webhook verification');
      return res.status(200).json({ status: 'ok' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const body = req.body; // raw Buffer because of express.raw()
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSig) {
      console.error('Webhook signature mismatch');
      return res.status(400).json({ status: 'invalid signature' });
    }

    const event = JSON.parse(body.toString());
    console.log('Razorpay Webhook event:', event.event);

    if (event.event === 'payment.captured') {
      const payment = event.payload.payment.entity;
      await userHelpers.updateOrderByRazorpayOrderId(
        payment.order_id,
        {
          paymentStatus: 'Paid',
          status: 'Placed',
          paymentId: payment.id
        }
      );
    }

    if (event.event === 'payment.failed') {
      const payment = event.payload.payment.entity;
      await userHelpers.updateOrderByRazorpayOrderId(
        payment.order_id,
        { paymentStatus: 'Failed', status: 'Payment Failed' }
      );
    }

    if (event.event === 'refund.created' || event.event === 'refund.processed') {
      const refund = event.payload.refund.entity;
      await userHelpers.updateOrderByRazorpayOrderId(
        refund.payment_id, // using paymentId as fallback key
        { paymentStatus: 'Refunded', status: 'Refunded', refundId: refund.id }
      );
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).json({ status: 'error' });
  }
});

// ─── Forgot Password ───────────────────────────────────────────
const nodemailer = require('nodemailer');

function getMailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

/**
 * Send transactional email via Brevo HTTPS API (works on Render free tier where SMTP is blocked)
 * or fall back to Gmail SMTP for local development.
 */
async function sendEmail({ to, subject, html }) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.GMAIL_USER;

  if (process.env.BREVO_API_KEY) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: 'CraftDesk Store', email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Brevo API error (${res.status}): ${errBody}`);
    }
    return;
  }

  const transporter = getMailTransporter();
  await transporter.sendMail({
    from: `"CraftDesk Store" <${senderEmail}>`,
    to,
    subject,
    html,
  });
}

// GET /forgot — show forgot password form
router.get('/forgot', (req, res) => {
  res.render('user/forgot');
});

// POST /forgot — generate token and send reset email
router.post('/forgot', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

    if (!email) {
      return res.render('user/forgot', { error: 'Please enter a valid email.' });
    }

    const token = await userHelpers.createPasswordResetToken(email);
    // Always show same success message whether email found or not (security: don't reveal registered emails)
    const successMsg = 'If that email is registered, a reset link has been sent. Check your inbox.';

    if (token) {
      const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password/${token}`;
      await sendEmail({
        to: email,
        subject: 'Reset your CraftDesk password',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;">
            <h2 style="color:#0d9488;">CraftDesk Store</h2>
            <p>Hi,</p>
            <p>We received a request to reset your password. Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
            <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:6px;margin:16px 0;">Reset Password</a>
            <p>If you didn't request this, ignore this email — your password won't change.</p>
            <hr>
            <small style="color:#888;">CraftDesk Store</small>
          </div>
        `,
      });
    }

    res.render('user/forgot', { success: successMsg });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('user/forgot', { error: 'Something went wrong. Please try again.' });
  }
});

// GET /reset-password/:token — show reset form
router.get('/reset-password/:token', async (req, res) => {
  try {
    const user = await userHelpers.findUserByResetToken(req.params.token);
    if (!user) {
      return res.render('user/forgot', { error: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    res.render('user/reset-password', { token: req.params.token });
  } catch (err) {
    console.error('Reset password GET error:', err);
    res.render('user/forgot', { error: 'Something went wrong. Please try again.' });
  }
});

// POST /reset-password/:token — update password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { newPassword, confirmNewPassword } = req.body;

    if (!newPassword || newPassword !== confirmNewPassword) {
      return res.render('user/reset-password', {
        token: req.params.token,
        error: 'Passwords do not match.'
      });
    }

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{5,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.render('user/reset-password', {
        token: req.params.token,
        error: 'Password must be at least 5 characters with at least 1 letter and 1 number.'
      });
    }

    const updated = await userHelpers.resetPassword(req.params.token, newPassword);

    if (!updated) {
      return res.render('user/forgot', { error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    // Destroy session in case user is logged in with old credentials
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/login?reset=success');
    });
  } catch (err) {
    console.error('Reset password POST error:', err);
    res.render('user/reset-password', { token: req.params.token, error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
