const { MongoClient } = require('mongodb');

const state = {
  db: null
};

module.exports.connect = function (done) {
  const url = process.env.MONGO_URI || 'mongodb://localhost:27017';
  // If MONGO_URI includes the DB name (Atlas connection string), use it directly;
  // otherwise fall back to appending the DB name.
  const dbName = 'craftdesk-store';

  MongoClient.connect(url)
    .then((client) => {
      state.db = client.db(dbName);
      done();
    })
    .catch((err) => done(err));
};

module.exports.get = function () {
  return state.db;
};
