import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config();

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    // Do not fail on invalid certs
    rejectUnauthorized: false
  },
  secure: false, // true for 465, false for other ports
  requireTLS: true
});

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error('Error with mailer configuration:', error);
  } else {
    console.log('Server is ready to take our messages');
  }
});

const app = express();
// Use Render's PORT environment variable with fallback
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0'; // Required for Render

// Sample data - in a real app, this would be in a database
let users = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
];

// Middleware
// Configure CORS for both development and production
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://your-production-domain.com' // Replace with your actual production domain
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));
app.use(express.json());

// Contact form submission endpoint
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // Basic validation
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and message are required' 
      });
    }

    // Email options
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || email,
      subject: 'New Contact Form Submission',
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
        <p><strong>Message:</strong></p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);
    
    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully!'
    });

  } catch (error) {
    console.error('Error sending contact form:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while sending your message. Please try again.'
    });
  }
});

// Log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Users endpoints
app.get('/api/users', (req, res) => {
  res.json(users);
});

app.get('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === parseInt(req.params.id));
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json(user);
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ message: 'Name and email are required' });
  }
  
  const newUser = {
    id: users.length + 1,
    name,
    email
  };
  
  users.push(newUser);
  res.status(201).json(newUser);
});

// Order submission
app.post('/api/orders', async (req, res) => {
  console.log('Received order request:', req.body);
  try {
    // Support both old and new format
    const { 
      name, 
      customerName, 
      email, 
      phone, 
      address = 'Not provided', // Make address optional
      items = req.body.productName ? 
        `${req.body.productName} x ${req.body.quantity || 1}` : 
        'Not specified',
      notes = ''
    } = req.body;

    const customerNameValue = name || customerName;
    
    // Validate required fields
    const missingFields = [];
    if (!customerNameValue) missingFields.push('الاسم');
    if (!email) missingFields.push('البريد الإلكتروني');
    if (!phone) missingFields.push('رقم الهاتف');
    
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: `The following fields are required: ${missingFields.join(', ')}` 
      });
    }

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ADMIN_EMAIL || email, // Send to admin email if set, otherwise to the customer
      subject: 'New Order',
      html: `
        <h2>New Order</h2>
        <p><strong>Name:</strong> ${customerNameValue}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone Number:</strong> ${phone}</p>
        ${address !== 'Not provided' ? `<p><strong>Address:</strong> ${address}</p>` : ''}
        <h3>Requested Products:</h3>
        <p>${items.replace(/\n/g, '<br>')}</p>
        ${notes ? `<h3>Additional Notes:</h3><p>${notes}</p>` : ''}
        <p>Order Date: ${new Date().toLocaleString('en-US')}</p>
      `
    };

    try {
      // Send email to admin
      await transporter.sendMail(mailOptions);
      console.log('Admin notification email sent successfully');
      
      // Send confirmation email to customer
      const customerMailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Order Confirmation',
        html: `
          <h2>Thank you for your order!</h2>
          <p>Your order has been received successfully and will be processed as soon as possible.</p>
          <p>Order Details:</p>
          <p><strong>Requested Products:</strong></p>
          <p>${items.replace(/\n/g, '<br>')}</p>
          <p>We will contact you soon to confirm your order and schedule delivery.</p>
          <p>Thank you for your trust in us!</p>
        `
      };

      await transporter.sendMail(customerMailOptions);
      console.log('Customer confirmation email sent successfully');
      
      res.status(201).json({ 
        success: true,
        message: 'Your request has been sent successfully' 
      });
      
    } catch (emailError) {
      console.error('Error sending email:', emailError);
      // Still return success to the client since the order was processed
      res.status(201).json({ 
        success: true,
        message: 'Your request has been received, but there was a problem sending the email confirmation',
        warning: 'Email notification failed'
      });
    }
  } catch (error) {
    console.error('Error processing order:', error);
    res.status(500).json({ message: 'An error occurred while processing your request' });
  }
});

// Orders endpoints
let orders = [];

app.post('/api/orders', (req, res) => {
  const { productId, productName, customerName, email, phone, quantity, notes } = req.body;
  
  if (!productId || !productName || !customerName || !email) {
    return res.status(400).json({ 
      success: false,
      message: 'Product ID, product name, customer name, and email are required' 
    });
  }

  const newOrder = {
    id: orders.length + 1,
    productId,
    productName,
    customerName,
    email,
    phone: phone || '',
    quantity: quantity || 1,
    notes: notes || '',
    status: 'pending',
    orderDate: new Date().toISOString()
  };
  
  orders.push(newOrder);
  
  // In a real app, you would save to a database and send confirmation emails here
  
  res.status(201).json({
    success: true,
    message: 'Order submitted successfully',
    order: newOrder
  });
});

app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server
app.listen(PORT, HOST, () => {
  console.log(`Server is running on http://${HOST}:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
