var express = require('express');
var router = express.Router();
const multer = require('multer');
const path = require('path');
const productHelpers = require('../helpers/product-helpers');
const { log } = require('console');
const fs = require('fs');

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


router.get('/', function (req, res, next) {
  
  res.render('admin/admin-dashboard', { admin: true ,activePage:'dashboard' });
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

router.post('/add-product', upload.array('images', 5), (req, res) => {
  
  const hasFiles = req.files && req.files.length > 0;
  const imageUrl = req.body.imageUrl?.trim();
let price = Number(req.body.price);
if (isNaN(price) || price < 0) price = 0;
req.body.price = price;


  // If BOTH empty → reject
if (!hasFiles && !imageUrl) {
  return res.render('admin/admin-add-product', {
    admin: true,
    activePage: 'products',
    error: "At least one product image is required."
  });
}


  // If uploaded files exist → use them
  if (hasFiles) {
    req.body.images = req.files.map(f => f.filename);
  }

  // If URL exists → store that as image
  else if (imageUrl) {
    req.body.images = [imageUrl];
  }
  req.body.stock = req.body.stock === "true";
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

router.use((req,res)=>{
  res.status(404);
  res.render("admin/admin-404", { admin:true });
});


module.exports = router;
