#!/bin/bash
# Test webhook endpoint

curl -X POST https://nonenticingly-unopposable-nakisha.ngrok-free.dev/api/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "status-update",
      "call": {
        "id": "test-call-id",
        "status": "started",
        "custom": {
          "userId": "test-user",
          "conversationId": "test-conv"
        }
      }
    }
  }'

