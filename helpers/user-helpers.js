const db = require('../config/connection')
const collection = require('../config/collections')
const bcrypt = require('bcrypt')

module.exports = {
   
  // SIGNUP
doSignup: (userData) => {
  return new Promise(async (resolve, reject) => {

    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{5,}$/;
    if (!passwordRegex.test(userData.password)) {
      return reject("Password must contain at least 1 letter and 1 number and be 5 characters long");
    }

    try {
      const existingUser = await db.get()
        .collection(collection.USER_COLLECTION)
        .findOne({ email: userData.email });

      if (existingUser) {
        return reject("Email already registered");
      }
      delete userData.confirmPassword;
      userData.password = await bcrypt.hash(userData.password, 10);

      const result = await db.get()
        .collection(collection.USER_COLLECTION)
        .insertOne(userData);

      resolve(result.insertedId);

    } catch (err) {
      reject("Signup failed. Please try again.");
    }
  });
},

  // LOGIN
  doLogin: (userData) => {
    return new Promise(async (resolve, reject) => {
      try {
        const user = await db.get()
          .collection(collection.USER_COLLECTION)
          .findOne({ email: userData.email })

        if (!user) {
          return resolve({ status: false })
        }

        const match = await bcrypt.compare(userData.password, user.password)

        if (match) {
          resolve({ user, status: true })
        } else {
          resolve({ status: false })
        }

      } catch (err) {
        reject(err)
      }
    })
  }

}
