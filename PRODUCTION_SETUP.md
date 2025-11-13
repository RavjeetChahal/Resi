# Production Setup Guide (Render Deployment)

## 1. Find Your Render URL

After deploying to Render, your server URL will be:

```
https://your-app-name.onrender.com
```

Replace `your-app-name` with your actual Render app name. You can find this in your Render dashboard.

## 2. Update Environment Variables on Render

### Server-Side Environment Variables (Render Dashboard)

Go to your Render dashboard → Your Web Service → Environment → Add the following:

```bash
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_ASSISTANT_ID=your_assistant_id_here
VAPI_WEBHOOK_URL=https://your-app-name.onrender.com/api/vapi/webhook

# Firebase (if not already set)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key

# CORS (allow your frontend domains)
CORS_ALLOW_ORIGINS=https://your-app-name.onrender.com,https://your-frontend-domain.com

# Other environment variables...
OPENAI_API_KEY=your_openai_api_key (if still using Whisper)
```

**Important**: Replace `your-app-name` with your actual Render app name in all URLs.

### Frontend Environment Variables

For Expo apps, you can set environment variables in:

1. **`app.json` or `app.config.js`**:

   ```json
   {
     "expo": {
       "extra": {
         "apiBaseUrl": "https://your-app-name.onrender.com",
         "vapiAssistantId": "your_vapi_assistant_id"
       }
     }
   }
   ```

2. **Or use `.env` file** (if using Expo Config Plugin):

   ```bash
   EXPO_PUBLIC_API_BASE_URL=https://your-app-name.onrender.com
   EXPO_PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id
   ```

3. **Or update `src/services/api.js`** directly:
   Change line 8:
   ```javascript
   const PRODUCTION_API = "https://your-app-name.onrender.com";
   ```

## 3. Update Vapi Dashboard Webhook URL

1. **Log in to Vapi Dashboard**: https://dashboard.vapi.ai

2. **Go to Your Assistant**:

   - Navigate to "Assistants" → Edit your assistant

3. **Update Webhook URL**:

   - Find "Webhook" section
   - Set webhook URL to: `https://your-app-name.onrender.com/api/vapi/webhook`
   - Select events you want to receive:
     - ✅ Status updates
     - ✅ Transcripts
     - ✅ Function calls
     - ✅ End of call reports

4. **Save the Assistant**

## 4. Verify Your Setup

### Check Server Health

Test your server is running:

```bash
curl https://your-app-name.onrender.com/health
```

You should get a response like:

```json
{ "status": "ok", "timestamp": "..." }
```

### Check Webhook Endpoint

Test your webhook endpoint:

```bash
curl -X POST https://your-app-name.onrender.com/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "status-update",
      "call": {
        "id": "test-call-id",
        "status": "started"
      }
    }
  }'
```

You should get a response:

```json
{ "received": true }
```

### Check Vapi Call Creation

Test creating a Vapi call:

```bash
curl -X POST https://your-app-name.onrender.com/api/vapi/create-call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_vapi_api_key" \
  -d '{
    "assistantId": "your_assistant_id",
    "userId": "test-user",
    "conversationId": "test-conv"
  }'
```

You should get a response with `callId`, `transportUrl`, and `listenUrl`.

## 5. Update Frontend Code (if needed)

If you haven't already, make sure your frontend is pointing to your Render URL:

### Option 1: Update `src/services/api.js`

Change the `PRODUCTION_API` constant:

```javascript
const PRODUCTION_API = "https://your-app-name.onrender.com";
```

### Option 2: Set Environment Variable

Set `EXPO_PUBLIC_API_BASE_URL` in your `.env` file:

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-app-name.onrender.com
```

### Option 3: Update `app.json`

Add to your `app.json`:

```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "https://your-app-name.onrender.com"
    }
  }
}
```

## 6. Deploy Frontend

After updating the frontend code:

1. **Commit and push to GitHub**:

   ```bash
   git add .
   git commit -m "Update production URLs"
   git push
   ```

2. **If using Expo Web**:

   - Build for production: `expo build:web`
   - Deploy the `dist` folder to your hosting service

3. **If using React Native**:
   - Build for iOS/Android: `expo build:ios` or `expo build:android`
   - Or use EAS Build: `eas build --platform ios` or `eas build --platform android`

## 7. Test the Integration

1. **Start a Vapi call** from your app
2. **Check Render logs** for webhook events
3. **Check Vapi dashboard** for call status
4. **Verify** that tickets are being created in Firebase

## 8. Troubleshooting

### Webhook Not Receiving Events

1. **Check Render logs**:

   - Go to Render dashboard → Your Web Service → Logs
   - Look for incoming POST requests to `/api/vapi/webhook`

2. **Verify webhook URL in Vapi dashboard**:

   - Make sure it's `https://your-app-name.onrender.com/api/vapi/webhook`
   - Not `http://` (must be HTTPS)

3. **Check CORS settings**:
   - Make sure `CORS_ALLOW_ORIGINS` includes your frontend domain

### Frontend Can't Connect to Backend

1. **Check API base URL**:

   - Verify `EXPO_PUBLIC_API_BASE_URL` is set correctly
   - Or check `PRODUCTION_API` in `src/services/api.js`

2. **Check CORS**:

   - Make sure your frontend domain is in `CORS_ALLOW_ORIGINS`

3. **Check Render service status**:
   - Make sure your Render service is running
   - Check Render dashboard for any errors

### Vapi Calls Failing

1. **Check Vapi API key**:

   - Verify `VAPI_API_KEY` is set in Render environment variables
   - Make sure it's correct (no extra spaces)

2. **Check Assistant ID**:

   - Verify `VAPI_ASSISTANT_ID` is set correctly
   - Or verify `EXPO_PUBLIC_VAPI_ASSISTANT_ID` is set in frontend

3. **Check webhook URL**:
   - Verify webhook URL in Vapi dashboard matches your Render URL
   - Test the webhook endpoint manually

## 9. Quick Reference

### Render Environment Variables

```bash
VAPI_API_KEY=your_vapi_api_key
VAPI_ASSISTANT_ID=your_assistant_id
VAPI_WEBHOOK_URL=https://your-app-name.onrender.com/api/vapi/webhook
CORS_ALLOW_ORIGINS=https://your-app-name.onrender.com
```

### Frontend Environment Variables

```bash
EXPO_PUBLIC_API_BASE_URL=https://your-app-name.onrender.com
EXPO_PUBLIC_VAPI_ASSISTANT_ID=your_assistant_id
```

### Vapi Dashboard Settings

- **Webhook URL**: `https://your-app-name.onrender.com/api/vapi/webhook`
- **Assistant ID**: (same as `VAPI_ASSISTANT_ID`)

## 10. Next Steps

1. ✅ Set environment variables on Render
2. ✅ Update webhook URL in Vapi dashboard
3. ✅ Update frontend API base URL
4. ✅ Test the integration
5. ✅ Monitor Render logs for errors
6. ✅ Monitor Vapi dashboard for call status

## Support

If you encounter issues:

1. Check Render logs for server errors
2. Check browser console for frontend errors
3. Check Vapi dashboard for call status
4. Verify all environment variables are set correctly
5. Test endpoints manually with `curl`
