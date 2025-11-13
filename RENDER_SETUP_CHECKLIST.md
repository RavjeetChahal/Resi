# Render Deployment Checklist

## Step 1: Find Your Render URL

1. Go to **Render Dashboard**: https://dashboard.render.com
2. Find your **Web Service**
3. Copy your service URL (e.g., `https://your-app-name.onrender.com`)

**Note**: The code currently has `https://resi-7125.onrender.com` hardcoded. If your URL is different, you'll need to update it.

## Step 2: Set Render Environment Variables

Go to **Render Dashboard → Your Web Service → Environment → Add Environment Variable**:

### Required Variables:

```bash
VAPI_API_KEY=your_vapi_api_key_here
VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
VAPI_WEBHOOK_URL=https://your-app-name.onrender.com/api/vapi/webhook
```

**Important**: Replace `your-app-name` with your actual Render app name!

### Optional Variables:

```bash
# CORS (if you have a separate frontend domain)
CORS_ALLOW_ORIGINS=https://your-app-name.onrender.com

# Your existing Firebase and other variables...
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...
```

## Step 3: Update Vapi Dashboard

1. Go to **Vapi Dashboard**: https://dashboard.vapi.ai
2. Navigate to **Assistants** → Edit your assistant
3. In **Webhook** section:
   - Set URL to: `https://your-app-name.onrender.com/api/vapi/webhook`
   - Enable events: Status updates, Transcripts, Function calls, End of call reports
4. **Save** the assistant

## Step 4: Update Frontend Code (if Render URL changed)

If your Render URL is different from `resi-7125.onrender.com`, update these files:

### Update `src/services/api.js` (line 8):
```javascript
const PRODUCTION_API = "https://your-app-name.onrender.com";
```

### Update `src/services/vapi.js` (line 36):
```javascript
const PRODUCTION_API = "https://your-app-name.onrender.com";
```

**Note**: For web, the code automatically uses `window.location.origin`, so if Render serves both frontend and backend, it should work automatically.

## Step 5: Test Your Deployment

### Test Server Health:
```bash
curl https://your-app-name.onrender.com/health
```
Expected: `{"status":"ok","timestamp":"..."}`

### Test Webhook:
```bash
curl -X POST https://your-app-name.onrender.com/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"status-update","call":{"id":"test","status":"started"}}}'
```
Expected: `{"received":true}`

### Test Vapi Call Creation:
```bash
curl -X POST https://your-app-name.onrender.com/api/vapi/create-call \
  -H "Content-Type: application/json" \
  -d '{"assistantId":"your_assistant_id","userId":"test","conversationId":"test"}'
```
Expected: `{"callId":"...","transportUrl":"...","listenUrl":"..."}`

## Step 6: Deploy and Test

1. **Commit and push** any code changes:
   ```bash
   git add .
   git commit -m "Update production URLs"
   git push
   ```

2. **Wait for Render** to redeploy (usually takes 2-5 minutes)

3. **Test the app**:
   - Make a Vapi call from your app
   - Check Render logs for webhook events
   - Check Vapi dashboard for call status
   - Verify tickets are created in Firebase

## Troubleshooting

### Webhook Not Receiving Events
- ✅ Check Render logs: **Render Dashboard → Your Service → Logs**
- ✅ Verify webhook URL in Vapi dashboard (must be HTTPS)
- ✅ Make sure `VAPI_WEBHOOK_URL` is set in Render environment variables
- ✅ Test webhook endpoint manually with `curl`

### Frontend Can't Connect
- ✅ Check if Render URL is correct in `src/services/api.js` and `src/services/vapi.js`
- ✅ For web, check browser console for CORS errors
- ✅ Verify Render service is running

### Vapi Calls Failing
- ✅ Check `VAPI_API_KEY` is set in Render environment variables
- ✅ Check `VAPI_ASSISTANT_ID` is set in Render environment variables
- ✅ Verify assistant ID matches in Vapi dashboard
- ✅ Check Render logs for Vapi API errors

## Quick Reference

### Your URLs Should Be:

1. **Render Service URL**: `https://your-app-name.onrender.com`
2. **Webhook URL**: `https://your-app-name.onrender.com/api/vapi/webhook`
3. **Health Check**: `https://your-app-name.onrender.com/health`
4. **API Base URL** (frontend): `https://your-app-name.onrender.com`

### Environment Variables on Render:

```bash
VAPI_API_KEY=your_vapi_api_key
VAPI_ASSISTANT_ID=your_assistant_id
VAPI_WEBHOOK_URL=https://your-app-name.onrender.com/api/vapi/webhook
```

### Vapi Dashboard Settings:

- **Webhook URL**: `https://your-app-name.onrender.com/api/vapi/webhook`
- **Assistant ID**: (same as `VAPI_ASSISTANT_ID`)

## Next Steps

1. ✅ Find your Render URL
2. ✅ Set environment variables on Render
3. ✅ Update webhook URL in Vapi dashboard
4. ✅ Update frontend code if URL changed
5. ✅ Test all endpoints
6. ✅ Deploy and test the full integration

---

**Need Help?** Check:
- Render logs: **Render Dashboard → Your Service → Logs**
- Browser console for frontend errors
- Vapi dashboard for call status

