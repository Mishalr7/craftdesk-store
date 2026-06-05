# CraftDesk Store

A full-stack e-commerce web application built using Node.js, Express.js, MongoDB, Handlebars, HTML, CSS, and Bootstrap.

## Overview

CraftDesk Store is an online shopping platform that allows users to browse products, create accounts, manage addresses, add products to cart, and place orders through a complete checkout flow.

The project follows the MVC pattern and uses MongoDB as the database for storing products, users, carts, addresses, and orders.

---

## Features

### User Features

* User Registration
* User Login & Logout
* Password Hashing with Bcrypt
* Product Browsing
* Product Details
* Add to Cart
* Update Cart Quantity
* Remove Items from Cart
* Cart Total Calculation
* Address Management

  * Add Address
  * View Addresses
  * Set Default Address
  * Delete Address
* Checkout System
* Cash on Delivery (COD)
* Order Placement
* Order History
* Account Dashboard

### Admin Features

* Admin Login
* Add Products
* Edit Products
* Delete Products
* Product Image Upload
* Product Management Dashboard

---

## Tech Stack

### Backend

* Node.js
* Express.js
* MongoDB
* Bcrypt

### Frontend

* Handlebars (HBS)
* HTML5
* CSS3
* Bootstrap 5

### Database

* MongoDB

---

## Database Collections

### Users

Stores:

* User Information
* Hashed Passwords
* Saved Addresses
* Default Address

### Products

Stores:

* Product Name
* Price
* Brand
* Category
* Description
* Stock
* Product Images

### Cart

Stores:

* User ID
* Product IDs
* Quantity

### Orders

Stores:

* User ID
* Delivery Details
* Ordered Products
* Payment Method
* Order Status
* Order Date

---

## Project Structure

```text
CraftDesk Store
│
├── bin
├── config
├── helpers
├── public
│   ├── images
│   └── stylesheets
├── routes
├── views
│   ├── admin
│   └── user
├── app.js
├── package.json
└── README.md
```

## Installation

Clone the repository:

```bash
git clone https://github.com/Mishal7/craftdesk-store.git
```

Move into the project directory:

```bash
cd craftdesk-store
```

Install dependencies:

```bash
npm install
```

Start MongoDB.

Run the application:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

---

## Current Functionalities

✅ Authentication System

✅ Product Management

✅ Shopping Cart

✅ Address Management

✅ Checkout Flow

✅ Order Placement

✅ Order History

✅ Admin Dashboard

---

## Future Improvements

* Razorpay Integration
* Online Payments
* Product Search
* Product Filters
* Wishlist
* User Profile Editing
* Order Cancellation
* Email Notifications
* Inventory Management
* Sales Analytics Dashboard

---

## Author

Mishal K

GitHub:
https://github.com/Mishal7

---

## License

This project is built for learning and portfolio purposes.
