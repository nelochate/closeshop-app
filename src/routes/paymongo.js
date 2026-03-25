// routes/paymongo.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

const PAYMONGO_SECRET = process.env.PAYMONGO_PLATFORM_SECRET;
const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';

// Create a child account for a seller
router.post('/create-seller-account', async (req, res) => {
  try {
    const { sellerId, businessName, email } = req.body;
    
    const response = await axios.post(
      `${PAYMONGO_BASE_URL}/platform/accounts`,
      {
        data: {
          attributes: {
            name: businessName,
            email: email,
            type: 'child',
            metadata: {
              seller_id: sellerId,
              platform: 'your_marketplace'
            }
          }
        }
      },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Store paymongo_account_id in your shops table
    await supabase
      .from('shops')
      .update({ 
        paymongo_account_id: response.data.data.id,
        paymongo_account_status: 'active'
      })
      .eq('id', sellerId);
    
    res.json({ success: true, account: response.data });
  } catch (error) {
    console.error('Error creating seller account:', error);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Create a payment intent with split
router.post('/create-payment', async (req, res) => {
  try {
    const { amount, currency = 'PHP', description, sellerId, platformFee = 0.10 } = req.body;
    
    // Get seller's PayMongo account ID
    const { data: shop } = await supabase
      .from('shops')
      .select('paymongo_account_id')
      .eq('id', sellerId)
      .single();
    
    const sellerAmount = amount * (1 - platformFee);
    const platformAmount = amount * platformFee;
    
    const response = await axios.post(
      `${PAYMONGO_BASE_URL}/payment_intents`,
      {
        data: {
          attributes: {
            amount: amount,
            payment_method_allowed: ['gcash'],
            payment_method_options: {
              gcash: {
                split: {
                  payments: [
                    {
                      amount: sellerAmount,
                      destination: shop.paymongo_account_id,
                      description: `Payment to seller ${sellerId}`
                    },
                    {
                      amount: platformAmount,
                      destination: 'platform_master_account_id',
                      description: 'Platform fee'
                    }
                  ]
                }
              }
            },
            description: description,
            statement_descriptor: 'Marketplace Payment',
            currency: currency
          }
        }
      },
      {
        headers: {
          'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    res.json({ 
      clientKey: response.data.data.attributes.client_key,
      paymentIntentId: response.data.data.id
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// Webhook handler for payment events
router.post('/webhook', async (req, res) => {
  const webhookSecret = req.headers['paymongo-signature'];
  
  // Verify webhook signature
  // (you'll need to implement signature verification)
  
  const event = req.body;
  
  switch (event.type) {
    case 'payment_intent.succeeded':
      // Handle successful payment
      // Update order status
      // Release funds to seller
      break;
      
    case 'payment_intent.payment_failed':
      // Handle failed payment
      break;
      
    case 'platform.payout.completed':
      // Handle seller payout completion
      break;
  }
  
  res.json({ received: true });
});

module.exports = router;