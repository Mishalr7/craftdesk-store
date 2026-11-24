var express = require('express');
var router = express.Router();
const multer = require('multer');
const path = require('path');
const productHelpers = require('../helpers/product-helpers');
const userHelpers = require('../helpers/user-helpers');
const { log } = require('console');
const fs = require('fs');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');

// Rate limiter: max 10 admin login attempts per 15 minutes per IP
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
});

function verifyAdmin(req, res, next) {
  if (req.session && req.session.adminLoggedIn) {
    return next();
  }
  const isJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'));
  if (isJson || req.method === 'POST') {
    return res.status(401).json({ success: false, message: 'Admin authentication required' });
  }
  res.redirect('/admin/login');
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});


// Storage config
const storage = multer.diskStorage({
  destination: function(req, file, cb){
    cb(null, './public/product-images'); 
  },
  filename: function(req, file, cb){
    cb(null, Date.now() + path.extname(file.originalname)); 
  }
});

// Multer instance
const upload = multer({ storage: storage });

// Public admin auth routes
router.get('/login', (req, res) => {
  if (req.session && req.session.adminLoggedIn) {
    return res.redirect('/admin');
  }
  res.render('admin/admin-login');
});

router.post('/login', adminLoginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.render('admin/admin-login', { loginError: 'Invalid email or password' });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const adminHash = process.env.ADMIN_PASSWORD_HASH || '';

    if (!adminEmail || !adminHash) {
      console.error('ADMIN_EMAIL or ADMIN_PASSWORD_HASH not configured in .env');
      return res.render('admin/admin-login', { loginError: 'Admin login is not configured.' });
    }

    const emailMatch = email.trim().toLowerCase() === adminEmail;
    const passwordMatch = emailMatch ? await bcrypt.compare(password, adminHash) : false;

    if (emailMatch && passwordMatch) {
      req.session.admin = { email: adminEmail };
      req.session.adminLoggedIn = true;
      return res.redirect('/admin');
    }

    res.render('admin/admin-login', { loginError: 'Invalid email or password' });
  } catch (err) {
    console.error('Admin login error:', err);
    res.render('admin/admin-login', { loginError: 'Something went wrong. Please try again.' });
  }
});

router.get('/logout', (req, res) => {
  if (req.session) {
    delete req.session.admin;
    delete req.session.adminLoggedIn;
  }
  res.redirect('/admin/login');
});

// Protect all routes below with verifyAdmin
router.use(verifyAdmin);

router.get('/', async function (req, res, next) {
  try {
    const stats = await userHelpers.getDashboardStats();
    res.render('admin/admin-dashboard', {
      admin: true,
      activePage: 'dashboard',
      stats
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.render('admin/admin-dashboard', {
      admin: true,
      activePage: 'dashboard',
      stats: {
        totalRevenue: '0',
        totalOrders: '0',
        totalProducts: '0',
        totalUsers: '0',
        paidOrders: 0,
        pendingOrders: 0,
        recentActivity: [],
        chartLabelsJson: '[]',
        chartDataJson: '[]'
      }
    });
  }
});


router.get('/products', async (req, res) => {
  productHelpers.getAllProducts().then((products) => {
    res.render('admin/admin-products', {
      admin: true,
      products,
      activePage: 'products'
    });
  }).catch(err => {
    console.log(err);
    res.send("Error fetching products");
  });
});


router.get('/add-product', function (req, res){
  res.render('admin/admin-add-product', { admin: true ,activePage:'products' });
});

const productImageUpload = upload.fields([
  { name: 'mainImage', maxCount: 1 },
  { name: 'galleryImages', maxCount: 4 }
]);

router.post('/add-product', productImageUpload, (req, res) => {
  const mainFile = req.files?.mainImage?.[0]?.filename || null;
  const mainUrl = req.body.mainImageUrl?.trim() || '';
  let price = Number(req.body.price);
  if (isNaN(price) || price < 0) price = 0;
  req.body.price = price;

  if (!mainFile && !mainUrl) {
    return res.render('admin/admin-add-product', {
      admin: true,
      activePage: 'products',
      error: "Main cover image is required (upload a file or provide a URL)."
    });
  }

  const mainImg = mainFile || mainUrl;
  const galleryFiles = (req.files?.galleryImages || []).map(f => f.filename);
  const galleryUrls = (req.body.galleryImageUrls || '')
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(Boolean);

  req.body.images = [mainImg, ...galleryFiles, ...galleryUrls].slice(0, 5);
  delete req.body.mainImageUrl;
  delete req.body.galleryImageUrls;

  const origPrice = req.body.originalPrice ? Number(req.body.originalPrice) : null;
  req.body.originalPrice = (origPrice && origPrice > price) ? origPrice : null;
  const stockCount = Math.max(0, parseInt(req.body.stockCount, 10) || 0);
  req.body.stockCount = stockCount;
  req.body.stock = stockCount > 0 && req.body.stock === "true";
  req.body.isFeatured = req.body.isFeatured === "on" || req.body.isFeatured === "true";
  productHelpers.addProduct(req.body, () => {
    res.redirect('/admin/products');
  });

});

router.get('/delete-product/:id', async (req, res) => {
  const productId = req.params.id;

  try {
    const product = await productHelpers.deleteProduct(productId);

    if (product && product.images && product.images.length > 0) {
      product.images.forEach(img => {
        if (img.startsWith('http')) return;

        const imgPath = path.join(__dirname, '../public/product-images', img);

        if (fs.existsSync(imgPath)) {
          fs.unlinkSync(imgPath);
        }
      });
    }

    res.redirect('/admin/products');
  } catch (err) {
    console.log(err);
    res.send("Error deleting product");
  }
});

router.get('/edit-product/:id', async (req, res) => {

  const product = await productHelpers.getProductById(req.params.id);

  if (!product) {
    return res.status(404).render('admin/admin-404', { admin: true });
  }

  res.render('admin/edit-product', {
    product,
    admin: true,
    activePage: 'products'
  });

});

router.post('/edit-product/:id', productImageUpload, async (req, res) => {

  try {
    const existingProduct = await productHelpers.getProductById(req.params.id);
    let images = Array.isArray(existingProduct?.images) ? [...existingProduct.images] : [];

    // 1. Remove images checked for deletion
    const removeRaw = req.body.removeImages;
    const toRemove = Array.isArray(removeRaw) ? removeRaw : (removeRaw ? [removeRaw] : []);
    if (toRemove.length > 0) {
      images = images.filter(img => {
        if (toRemove.includes(img)) {
          if (!img.startsWith('http')) {
            const imgPath = path.join(__dirname, '../public/product-images', img);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
          }
          return false;
        }
        return true;
      });
    }

    // 2. If user selected an existing image as Main Cover, move it to index 0
    const selectedMain = req.body.mainImageName;
    if (selectedMain && images.includes(selectedMain)) {
      images = [selectedMain, ...images.filter(img => img !== selectedMain)];
    }

    // 3. If a new Main Cover image was uploaded or provided via URL, put it at index 0
    const newMainFile = req.files?.mainImage?.[0]?.filename || null;
    const newMainUrl = req.body.mainImageUrl?.trim() || '';
    const newMain = newMainFile || newMainUrl;
    if (newMain) {
      images = [newMain, ...images];
    }

    // 4. Append any newly uploaded gallery images or URLs
    const galleryFiles = (req.files?.galleryImages || []).map(f => f.filename);
    const galleryUrls = (req.body.galleryImageUrls || '')
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);
    images = [...images, ...galleryFiles, ...galleryUrls].slice(0, 5);

    const stockCount = Math.max(0, parseInt(req.body.stockCount, 10) || 0);
    req.body.stockCount = stockCount;
    req.body.stock = stockCount > 0 && req.body.stock === "true";
    req.body.isFeatured = req.body.isFeatured === "on" || req.body.isFeatured === "true";

    await productHelpers.updateProduct(
      req.params.id,
      req.body,
      images
    );

    res.redirect('/admin/products');

  } catch (err) {

    console.log(err);
    res.status(500).send("Error updating product");

  }

});

// Admin Categories — list, add, delete
router.get('/categories', async (req, res) => {
  try {
    const categories = await productHelpers.getAllCategories();
    res.render('admin/admin-categories', {
      admin: true,
      activePage: 'categories',
      categories,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Admin categories error:', err);
    res.status(500).send('Error loading categories');
  }
});

router.post('/categories/add', async (req, res) => {
  try {
    const result = await productHelpers.addCategory(req.body.name);
    if (!result.status) {
      return res.redirect('/admin/categories?error=' + encodeURIComponent(result.message));
    }
    res.redirect('/admin/categories?success=' + encodeURIComponent('Category added!'));
  } catch (err) {
    console.error('Add category error:', err);
    res.redirect('/admin/categories?error=' + encodeURIComponent('Failed to add category'));
  }
});

router.get('/categories/delete/:id', async (req, res) => {
  try {
    await productHelpers.deleteCategory(req.params.id);
    res.redirect('/admin/categories?success=' + encodeURIComponent('Category deleted'));
  } catch (err) {
    console.error('Delete category error:', err);
    res.redirect('/admin/categories?error=' + encodeURIComponent('Failed to delete category'));
  }
});

// Admin Profile
router.get('/profile', (req, res) => {
  const razorpayKey = process.env.RAZORPAY_KEY_ID || '';
  res.render('admin/admin-profile', {
    admin: true,
    activePage: 'settings',
    profile: {
      email: req.session?.admin?.email || process.env.ADMIN_EMAIL || 'admin@craftdesk.com',
      environment: process.env.NODE_ENV || 'development',
      razorpayMode: razorpayKey.startsWith('rzp_live_') ? 'Live Mode' : 'Test Mode',
      gmailConfigured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
      baseUrl: process.env.BASE_URL || 'http://localhost:3000'
    }
  });
});

// Admin Site Settings
router.get('/site-settings', async (req, res) => {
  try {
    const settings = await userHelpers.getSiteSettings();
    res.render('admin/admin-site-settings', {
      admin: true,
      activePage: 'settings',
      settings,
      saved: req.query.saved === 'true'
    });
  } catch (err) {
    console.error('Site settings GET error:', err);
    res.status(500).send('Error loading site settings');
  }
});

router.post('/site-settings', async (req, res) => {
  try {
    await userHelpers.updateSiteSettings(req.body);
    res.redirect('/admin/site-settings?saved=true');
  } catch (err) {
    console.error('Site settings POST error:', err);
    res.status(500).send('Error saving site settings');
  }
});

// Admin Users — view all registered users
router.get('/users', async (req, res) => {
  try {
    const users = await userHelpers.getAllUsers();
    res.render('admin/admin-users', {
      admin: true,
      activePage: 'users',
      users
    });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).send('Error loading users');
  }
});

// Admin Orders — view all orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await userHelpers.getAllOrders();
    res.render('admin/admin-orders', {
      admin: true,
      activePage: 'orders',
      orders
    });
  } catch (err) {
    console.error('Admin orders error:', err);
    res.status(500).send('Error loading orders');
  }
});

// Admin — update order status
router.post('/update-order-status/:id', async (req, res) => {
  try {
    await userHelpers.updateOrderStatus(req.params.id, req.body.status);
    res.json({ success: true });
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Admin — initiate Razorpay refund
router.post('/refund-order/:id', async (req, res) => {
  try {
    const orders = await userHelpers.getAllOrders();
    const order = orders.find(o => o._id.toString() === req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (!order.paymentId) {
      return res.status(400).json({ success: false, message: 'No payment ID on this order' });
    }
    if (order.paymentStatus === 'Refunded') {
      return res.status(400).json({ success: false, message: 'Already refunded' });
    }

    // Initiate refund via Razorpay API
    const refund = await razorpay.payments.refund(order.paymentId, {
      amount: Math.round(order.totalAmount * 100), // paise
      speed: 'normal',
      notes: { reason: 'Admin initiated refund', orderId: order._id.toString() }
    });

    // Update order in DB
    await userHelpers.updateOrderByRazorpayOrderId(
      order.razorpayOrderId || order.paymentId,
      {
        paymentStatus: 'Refunded',
        status: 'Refunded',
        refundId: refund.id
      }
    );

    res.json({ success: true, refundId: refund.id });
  } catch (err) {
    console.error('Refund error:', err);
    res.status(500).json({
      success: false,
      message: err.error ? err.error.description : 'Refund failed'
    });
  }
});

router.use((req,res)=>{
  res.status(404);
  res.render("admin/admin-404", { admin:true });
});
module.exports = router;
