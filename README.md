# 🎪 EventHub - Full-Stack Event Management Platform

![EventHub Banner](https://via.placeholder.com/1200x400/0A0A0A/E63946?text=EventHub+-+Premium+Event+Management)

EventHub is a robust, multi-role event management system that allows users to discover and book events, organizers to host and manage them, and administrators to oversee platform operations. It features secure payments, QR code ticket validation, and a modern, glassmorphism-inspired UI.

## ✨ Core Features

### 👤 For Users (Attendees)
* **Discover Events:** Browse, filter, and search for upcoming events.
* **Secure Booking:** Purchase tickets seamlessly using Razorpay or PayPal.
* **Smart Ticketing:** Receive unique QR codes for instant venue check-ins.
* **Interactive Dashboard:** Manage bookings with a personalized event calendar.
* **Authentication:** Standard email login alongside Google/Facebook OAuth.

### 🎪 For Organizers
* **Event Creation:** Launch events with custom capacities, pricing tiers, and banners.
* **Real-Time Analytics:** Monitor ticket sales and revenue generation.
* **Attendee Management:** Scan attendee QR codes at the door for seamless check-ins.

### 👑 For Administrators
* **Platform Oversight:** Global dashboard tracking total users, events, and revenue.
* **Moderation:** Approve or reject organizer applications and oversee live events.
* **Comprehensive Reporting:** Generate detailed sales, revenue, and commission reports.

---

## 🛠️ Tech Stack

* **Frontend:** HTML5, CSS3 (Custom Glassmorphism UI), EJS (Embedded JavaScript templates), Client-side JS.
* **Backend:** Node.js, Express.js
* **Database:** MongoDB (via Mongoose)
* **Authentication:** Passport.js (Local Strategy & OAuth2.0)
* **Payments:** Razorpay Node SDK, PayPal Checkout SDK
* **Utilities:** `qrcode` (Ticket generation), `multer` (Image uploads), `puppeteer`/`pdfkit` (Report generation)

---

## 🚀 Getting Started

Follow these instructions to set up the project locally on your machine.

### Prerequisites
* [Node.js](https://nodejs.org/) (v16 or higher)
* [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas)
* A Razorpay / PayPal Developer Account
* Google Cloud Console Account (For OAuth credentials)

### Installation

1. **Clone the repository**
   ```bash
   git clone [https://github.com/yourusername/eventhub.git](https://github.com/yourusername/eventhub.git)
   cd eventhub