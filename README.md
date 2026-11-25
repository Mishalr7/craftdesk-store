# CraftDesk Store

A full-stack e-commerce web application for stationery, art, and craft supplies built with **Node.js**, **Express**, **MongoDB**, **Handlebars**, **Cloudinary**, and **Razorpay**.

🔗 **Live Demo:** [https://craftdesk-store.onrender.com/](https://craftdesk-store.onrender.com/)

> **Note:** Hosted on Render's free tier — if the site hasn't been visited recently, the first load may take ~30–50 seconds to wake up.

---

## How to Use the Store (User Guide)

### 1. Browse Freely Without Signing Up
You can explore the entire storefront as a guest without creating an account:
- **Home (`/`):** View featured and in-stock products with discount badges (`% OFF`) and crossed-out MRP pricing.
- **Search & Filters:** Use the search bar or navbar links (**Categories**, **New Arrivals**, **Offers**) to filter products.
- **Product Detail Page:** Click any product card to view its image gallery, stock availability, full description, and related products.
- **Blog (`/blog`):** Read the CraftDesk story.
- **Theme Toggle:** Switch between **Light Mode** and **Dark Mode** from the navbar.

### 2. Sign Up & Verify Your Email
To add items to your cart and place orders, you need a verified account:
1. Click the **Account** icon in the top-right navbar → **Sign Up**.
2. Register using a **valid email address** you have access to.
3. Check your inbox (and spam folder) for the **verification email** and click the verification link.
4. Once verified, you'll be redirected to **Log In** *(you can also request a new verification email or use **Forgot Password** if needed)*.

### 3. Shop & Manage Your Cart
- Click **Add to Cart** from a product detail page (or use the `−` / `+` quantity stepper directly on the page).
- Stock limits are enforced automatically so you cannot order more than available stock.
- Open the **Cart** (`/cart`) to adjust quantities or remove items.

### 4. Checkout & Payment (Razorpay Test / Demo Mode)
1. Proceed to **Checkout** (`/checkout`) from your cart.
2. Add or select a delivery address.
3. Choose a payment method:
   - **Online Payment (Razorpay — Test/Demo Mode):** Opens the Razorpay test checkout modal. **No real money is charged** — use Razorpay's test payment options (e.g., Test Card or Test UPI `success@razorpay`) to simulate a live payment.
   - **Cash on Delivery (COD):** Places the order immediately *(can be toggled on/off from Admin Site Settings)*.
4. View your placed orders anytime under **Account → My Orders**.

---

## Features

### Storefront
- Guest browsing, live search, category/offers/newest filtering
- Email-verified user authentication (Signup, Login, Resend Verification, Forgot & Reset Password)
- Persistent MongoDB-backed shopping cart with real-time badge sync
- Numeric inventory tracking & out-of-stock protection
- Razorpay online payments + webhook verification + Cash on Delivery
- Responsive mobile & desktop layout with Light/Dark mode

### Admin Portal (`/admin/login`)
- Protected by `.env` credentials (`bcrypt` hashed password), rate limiting, and CSRF protection
- **Dashboard:** Live revenue, order, product, and user stats + 7-day revenue bar chart (`Chart.js`)
- **Products:** Add/Edit/Delete products, Cloudinary multi-image uploads (main cover + gallery), MRP/offer pricing, stock counts, and featured toggle
- **Categories:** Dynamic category management
- **Orders:** Order status updates and Razorpay refunds
- **Users:** Customer list with verification status, order counts, and total spend
- **Site Settings:** Live store name, top announcement banner, free shipping threshold, and COD toggle

---

## Tech Stack

- **Backend:** Node.js, Express.js, `express-session`, `connect-mongo`, `csrf-csrf`, `express-rate-limit`, `bcrypt`
- **Database:** MongoDB (native `mongodb` driver / MongoDB Atlas)
- **Templating & UI:** Express Handlebars (`hbs`), HTML5, CSS3, Bootstrap 5, SweetAlert2, Chart.js
- **Payments:** Razorpay SDK + HMAC Webhook verification
- **Media & Email:** Cloudinary (`multer-storage-cloudinary`), Nodemailer (Gmail SMTP)

---

## Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Mishalr7/craftdesk-store.git
   cd craftdesk-store
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Create a `.env` file** in the root directory:
   ```env
   NODE_ENV=development
   BASE_URL=http://localhost:3000
   MONGO_URI=mongodb://localhost:27017/craftdesk-store
   SESSION_SECRET=your_session_secret
   CSRF_SECRET=your_csrf_secret

   GMAIL_USER=your_gmail@gmail.com
   GMAIL_APP_PASSWORD=your_16_char_app_password

   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD_HASH='$2b$10$...'

   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=your_razorpay_secret
   RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```

4. **Run the application:**
   ```bash
   npm start
   ```
   Open `http://localhost:3000` in your browser.

---

## Author

**Mishal** — [github.com/Mishalr7](https://github.com/Mishalr7)
