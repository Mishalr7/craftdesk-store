const db = require('../config/connection');
const collection = require('../config/collections');
const { ObjectId } = require('mongodb'); 

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

  getAllProducts: () => {
    return new Promise(async (resolve, reject) => {
      try {
        const products = await db
          .get()
          .collection(collection.PRODUCT_COLLECTION)
          .find()
          .toArray();

        resolve(products);
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
}


};



