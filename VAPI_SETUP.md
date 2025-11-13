# Vapi Integration Setup Guide

## What is a Webhook URL?

A **webhook URL** is a publicly accessible endpoint on your server where Vapi sends real-time events during a call. Vapi makes HTTP POST requests to this URL with event data like:

- Transcripts (what the user and assistant said)
- Function calls (when the assistant needs to extract structured data)
- Status updates (call started, ended, etc.)
- End-of-call reports (final summary)

## How to Get Your Webhook URL

### For Production (Deployed Server)

If your server is deployed on Render (or another hosting service), your webhook URL is:

```
https://resi-7125.onrender.com/api/vapi/webhook
```

Replace `resi-7125.onrender.com` with your actual server URL if different.

### For Local Development

For local development, you need to expose your local server to the internet. Use one of these methods:

#### Option 1: Use ngrok (Recommended)

1. **Install ngrok**: Download from https://ngrok.com/

2. **Start your local server**:

   ```bash
   npm run server
   # Server runs on http://localhost:3000
   ```

3. **Expose your local server**:

   ```bash
   ngrok http 3000
   ```

4. **Copy the HTTPS URL** (e.g., `https://abc123.ngrok.io`)

5. **Your webhook URL will be**:

   ```
   https://abc123.ngrok.io/api/vapi/webhook
   ```

6. **Update your Vapi assistant** with this URL in the Vapi dashboard

#### Option 2: Use Vapi's Test Mode

For testing, you can initially skip webhooks and handle events through the WebSocket connection. However, webhooks are recommended for production.

### Setting Up the Webhook in Vapi Dashboard

1. **Log in to Vapi Dashboard**: https://dashboard.vapi.ai

2. **Create or Edit an Assistant**:

   - Go to "Assistants" → Create New Assistant or Edit Existing

3. **Configure Webhook**:

   - In the assistant settings, find "Webhook" section
   - Enter your webhook URL: `https://your-server.com/api/vapi/webhook`
   - Select events you want to receive (transcripts, function calls, status updates)

4. **Save the Assistant**

## Environment Variables

Add these to your `.env` file (server):

```bash
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_ASSISTANT_ID=your_assistant_id_here
VAPI_WEBHOOK_URL=https://resi-7125.onrender.com/api/vapi/webhook

# For local development with ngrok:
# VAPI_WEBHOOK_URL=https://abc123.ngrok.io/api/vapi/webhook
```

Add to your frontend `.env` or `app.json`:

```bash
EXPO_PUBLIC_VAPI_ASSISTANT_ID=your_assistant_id_here
```

## Vapi Assistant Configuration

When creating your assistant in Vapi dashboard:

1. **System Prompt**:

   ```
   You are MoveMate, an AI assistant that triages dorm and residential life issues.
   Have a natural conversation with the resident to extract:
   - Category: Maintenance or Resident Life
   - Issue type: Short label (e.g., "Water Leak", "Noise Complaint")
   - Location: Where the issue occurs
   - Urgency: HIGH, MEDIUM, or LOW
   - Summary: One-sentence summary

   Ask follow-up questions if any information is missing. Once you have all required information, call the extract_issue_info function.
   ```

2. **Add Function Tool**: `extract_issue_info`

   In the Vapi dashboard, when creating/editing the function tool:

   **Tool Name**: `extract_issue_info`

   **Description**: `Extract structured issue information from the conversation. Call this function when you have gathered all required information from the user about their issue.`

   **Parameters Schema** (paste this in the JSON editor):

   ```json
   {
     "type": "object",
     "properties": {
       "category": {
         "type": "string",
         "enum": ["Maintenance", "Resident Life"],
         "description": "The category of the issue - Maintenance for facilities/equipment issues, Resident Life for roommate/noise/behavior issues"
       },
       "issue_type": {
         "type": "string",
         "description": "Short label for the issue (e.g., 'Water Leak', 'Noise Complaint', 'Broken Heater')"
       },
       "location": {
         "type": "string",
         "description": "Where the issue occurs (e.g., 'Room 201', 'Common Area', 'Bathroom')"
       },
       "urgency": {
         "type": "string",
         "enum": ["HIGH", "MEDIUM", "LOW"],
         "description": "HIGH for emergencies (water leaks, electrical sparks, safety threats), MEDIUM for active issues (leaks, broken fixtures, pests), LOW for cosmetic or minor issues"
       },
       "summary": {
         "type": "string",
         "description": "One-sentence summary of the issue"
       },
       "needs_more_info": {
         "type": "boolean",
         "description": "Set to false when all required fields are complete. Set to true if you need more information from the user."
       }
     },
     "required": [
       "category",
       "issue_type",
       "location",
       "urgency",
       "summary",
       "needs_more_info"
     ]
   }
   ```

   **Important**: Make sure:

   - The root `type` is set to `"object"` (not missing)
   - The `properties` object contains all the fields above
   - The `required` array includes all necessary fields

3. **Voice Settings**:
   - Model: Choose your preferred TTS model
   - Voice: Choose a voice (e.g., "nova", "alloy")
   - Speed: Adjust if needed

## Testing the Webhook

1. **Test locally with ngrok**:

   ```bash
   # Terminal 1: Start server
   npm run server

   # Terminal 2: Start ngrok
   ngrok http 3000

   # Terminal 3: Test webhook (use ngrok URL)
   curl -X POST https://abc123.ngrok.io/api/vapi/webhook \
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

2. **Check server logs** for webhook events

3. **Make a test call** from your app and verify events are received

## Troubleshooting

### Webhook not receiving events

- Verify the webhook URL is publicly accessible (not localhost)
- Check that your server is running and the endpoint exists
- Verify the URL in Vapi dashboard matches your server URL
- Check server logs for incoming requests

### CORS errors

- Make sure CORS is configured in your server
- Vapi webhook requests don't require CORS, but check your server CORS settings

### Function calls not working

- Verify the function is defined in your Vapi assistant
- Check that the function name matches exactly
- Review server logs for function call events

## Next Steps

1. Set up your Vapi account and get API key
2. Create an assistant in Vapi dashboard
3. Configure the webhook URL (use ngrok for local dev)
4. Add environment variables
5. Test the integration
