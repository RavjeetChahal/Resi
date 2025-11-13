# Production URLs Configuration

## Quick Setup Checklist

After deploying to Render, update these URLs:

### 1. Find Your Render URL

Check your Render dashboard for your web service URL. It will be something like:
```
https://your-app-name.onrender.com
```

**Note**: The code currently has `https://resi-7125.onrender.com` hardcoded. If your Render URL is different, you'll need to update it.

### 2. Render Environment Variables (Server-Side)

Go to **Render Dashboard → Your Web Service → Environment** and add/update:

```bash
# Required: Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_ASSISTANT_ID=your_vapi_assistant_id_here
VAPI_WEBHOOK_URL=https://your-app-name.onrender.com/api/vapi/webhook

# Optional: CORS (if you have a separate frontend domain)
CORS_ALLOW_ORIGINS=https://your-app-name.onrender.com

# Your existing Firebase and other environment variables...
```

**Important**: Replace `your-app-name` with your actual Render app name!

### 3. Vapi Dashboard Webhook URL

1. Go to **Vapi Dashboard** → https://dashboard.vapi.ai
2. Navigate to **Assistants** → Edit your assistant
3. In **Webhook** section, set:
   ```
   https://your-app-name.onrender.com/api/vapi/webhook
   ```
4. Enable these events:
   - ✅ Status updates
   - ✅ Transcripts
   - ✅ Function calls
   - ✅ End of call reports
5. **Save** the assistant

### 4. Frontend Configuration (Optional)

If your Render URL is different from `resi-7125.onrender.com`, update:

**Option A: Update `src/services/api.js`** (line 8):
```javascript
const PRODUCTION_API = "https://your-app-name.onrender.com";
```

**Option B: Set environment variable** (if using Expo Config Plugin):
```bash
EXPO_PUBLIC_API_BASE_URL=https://your-app-name.onrender.com
```

**Option C: Update `app.json`**:
```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "https://your-app-name.onrender.com"
    }
  }
}
```

**Note**: For web, the code automatically uses `window.location.origin`, so if Render serves both frontend and backend, it should work automatically.

## Testing Your URLs

### 1. Test Server Health
```bash
curl https://your-app-name.onrender.com/health
```
Should return: `{"status":"ok","timestamp":"..."}`

### 2. Test Webhook Endpoint
```bash
curl -X POST https://your-app-name.onrender.com/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"status-update","call":{"id":"test","status":"started"}}}'
```
Should return: `{"received":true}`

### 3. Test Vapi Call Creation
```bash
curl -X POST https://your-app-name.onrender.com/api/vapi/create-call \
  -H "Content-Type: application/json" \
  -d '{"assistantId":"your_assistant_id","userId":"test","conversationId":"test"}'
```
Should return: `{"callId":"...","transportUrl":"...","listenUrl":"..."}`

## Common Issues

### Webhook Not Receiving Events
- ✅ Check Render logs for incoming POST requests
- ✅ Verify webhook URL in Vapi dashboard (must be HTTPS)
- ✅ Make sure `VAPI_WEBHOOK_URL` is set in Render environment variables

### Frontend Can't Connect
- ✅ Check if Render URL is correct in `src/services/api.js`
- ✅ For web, check browser console for CORS errors
- ✅ Verify Render service is running

### Vapi Calls Failing
- ✅ Check `VAPI_API_KEY` is set in Render
- ✅ Check `VAPI_ASSISTANT_ID` is set in Render
- ✅ Verify assistant ID matches in Vapi dashboard

## Next Steps

1. ✅ Set environment variables on Render
2. ✅ Update webhook URL in Vapi dashboard
3. ✅ Update frontend code if Render URL changed
4. ✅ Test all endpoints
5. ✅ Deploy and test the full integration

## Support

If you encounter issues:
1. Check Render logs: **Render Dashboard → Your Service → Logs**
2. Check browser console for frontend errors
3. Check Vapi dashboard for call status
4. Verify all URLs match your actual Render deployment

