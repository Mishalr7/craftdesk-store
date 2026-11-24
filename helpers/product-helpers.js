const db = require('../config/connection');
const collection = require('../config/collections');
const { ObjectId } = require('mongodb'); 

function formatProduct(p) {
  const price = Number(p.price) || 0;
  const orig = Number(p.originalPrice) || 0;
  const hasOffer = orig > price && price > 0;
  const discountPercent = hasOffer ? Math.round(((orig - price) / orig) * 100) : 0;
  const hasStockCount = typeof p.stockCount === 'number';
  const lowStock = Boolean(p.stock) && hasStockCount && p.stockCount > 0 && p.stockCount <= 5;
  return {
    ...p,
    hasOffer,
    discountPercent,
    lowStock
  };
}

module.exports = {

  addProduct: (product, callback) => {
    db.get().collection(collection.PRODUCT_COLLECTION)
      .insertOne(product)
      .then((data) => {
        callback(data.insertedId);
      })
      .catch((err) => {
        console.log(err);
        callback(null);
      });
  },

  getAllProducts: (options = {}) => {
    return new Promise(async (resolve, reject) => {
      try {
        const filter = {};
        if (options.category) {
          const escaped = options.category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          filter.category = new RegExp('^' + escaped + '$', 'i');
        }
        if (options.offersOnly) {
          filter.$expr = { $gt: ['$originalPrice', '$price'] };
        }

        const sort = options.sort === 'newest'
          ? { stock: -1, _id: -1 }
          : { stock: -1, isFeatured: -1, _id: -1 };

        const products = await db
          .get()
          .collection(collection.PRODUCT_COLLECTION)
          .find(filter)
          .sort(sort)
          .toArray();

        resolve(products.map(formatProduct));
      } catch (err) {
        reject(err);
      }
    });
  },

  searchProducts: (query) => {
    return new Promise(async (resolve, reject) => {
      try {
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        const products = await db
          .get()
          .collection(collection.PRODUCT_COLLECTION)
          .find({
            $or: [
              { name: regex },
              { brand: regex },
              { category: regex },
              { description: regex }
            ]
          })
          .sort({ stock: -1, isFeatured: -1, _id: -1 })
          .toArray();

        resolve(products.map(formatProduct));
      } catch (err) {
        reject(err);
      }
    });
  },
deleteProduct: async (prodId) => {
  const product = await db.get()
    .collection(collection.PRODUCT_COLLECTION)
    .findOne({ _id: new ObjectId(prodId) });

  if (!product) return null;

  await db.get()
    .collection(collection.PRODUCT_COLLECTION)
    .deleteOne({ _id: new ObjectId(prodId) });

  return product;
},
  getProductById: (productId) => {
    return new Promise(async (resolve, reject) => {
      try {
        if (!ObjectId.isValid(productId)) {
          return resolve(null);
        }
        const product = await db.get()
          .collection(collection.PRODUCT_COLLECTION)
          .findOne({ _id: new ObjectId(productId) });

        resolve(product ? formatProduct(product) : null);
      } catch (err) {
        reject(err);
      }
    });
  }
,
updateProduct: (productId, productDetails, images = []) => {

  return new Promise(async (resolve, reject) => {

    try {

      const price = Number(productDetails.price) || 0;
      const orig = productDetails.originalPrice ? Number(productDetails.originalPrice) : null;
      const stockCount = typeof productDetails.stockCount === 'number'
        ? productDetails.stockCount
        : Math.max(0, parseInt(productDetails.stockCount, 10) || 0);

      let updateData = {

        name: productDetails.name,

        price: price,

        originalPrice: (orig && orig > price) ? orig : null,

        brand: productDetails.brand,

        category: productDetails.category,

        description: productDetails.description,

        stockCount: stockCount,

        stock: stockCount > 0 && Boolean(productDetails.stock),

        isFeatured: Boolean(productDetails.isFeatured)

      };

      // Update image only if new image exists
      if (images.length > 0) {

        updateData.images = images;

      }

      await db.get()
        .collection(collection.PRODUCT_COLLECTION)
        .updateOne(
          { _id: new ObjectId(productId) },
          {
            $set: updateData
          }
        );

      resolve();

    } catch (err) {

      reject(err);

    }

  });

},

  getAllCategories: async () => {
    const col = db.get().collection(collection.CATEGORY_COLLECTION);
    let categories = await col.find({}).sort({ name: 1 }).toArray();
    if (categories.length === 0) {
      const defaults = ['Office Essentials', 'Craft & DIY', 'Art & Paints', 'Stationery'];
      await col.insertMany(defaults.map(name => ({ name })));
      categories = await col.find({}).sort({ name: 1 }).toArray();
    }
    return categories;
  },

  addCategory: async (name) => {
    const cleanName = typeof name === 'string' ? name.trim() : '';
    if (!cleanName) return { status: false, message: 'Category name is required.' };

    const col = db.get().collection(collection.CATEGORY_COLLECTION);
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existing = await col.findOne({ name: new RegExp('^' + escaped + '$', 'i') });
    if (existing) {
      return { status: false, message: 'Category already exists.' };
    }

    await col.insertOne({ name: cleanName });
    return { status: true };
  },

  deleteCategory: async (id) => {
    await db.get().collection(collection.CATEGORY_COLLECTION).deleteOne({ _id: new ObjectId(id) });
  }
};



