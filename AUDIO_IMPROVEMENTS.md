# Audio Quality Improvements

## Changes Made

### 1. AudioWorklet for Input (Replaced ScriptProcessorNode)
- ✅ Uses `AudioWorkletNode` for microphone input (runs on dedicated audio thread)
- ✅ Lower latency and better performance
- ✅ Falls back to ScriptProcessorNode if AudioWorklet not supported

### 2. Jitter Buffer for Playback
- ✅ Implemented continuous playback with jitter buffer
- ✅ Buffers incoming audio chunks (50ms threshold) before starting playback
- ✅ Smooths out network jitter and prevents cutouts
- ✅ Auto-resumes when buffer refills

### 3. Optimized Audio Processing
- ✅ Reduced buffer thresholds (50ms initial, 20ms minimum)
- ✅ More aggressive WebSocket sending (only drop at 256KB)
- ✅ Efficient audio copying using `subarray` and `set`

### 4. Improved Buffer Management
- ✅ Limits max buffer size to 300ms (prevents excessive delay)
- ✅ Drops oldest chunks if buffer exceeds limit
- ✅ Continuous playback prevents gaps

## Remaining Issues

If audio is still laggy or cutting out, check these:

### 1. Vapi Configuration (Dashboard)
- **STT Provider**: Try faster providers (e.g., Deepgram, ElevenLabs STT)
- **TTS Provider**: Use faster providers (e.g., ElevenLabs, PlayHT)
- **Endpointing Settings**: 
  - Reduce `startSpeakingDelay` (default: 200ms) to 100ms or less
  - Reduce `stopSpeakingDelay` (default: 700ms) to 300ms or less
  - Enable "Smart Endpointing" if available

### 2. Network Quality
- Check network latency to Vapi servers
- Test on different networks (WiFi vs mobile data)
- Check for packet loss or jitter

### 3. Browser/Device
- Use Chrome/Edge for best AudioWorklet support
- Close other tabs/applications to free CPU
- Check CPU usage during calls

### 4. Server Configuration
- Check if server is close to Vapi's servers
- Verify server has enough CPU/memory
- Check server logs for errors or delays

## Testing

1. **Check Console Logs**:
   - Look for `[Vapi] AudioWorklet setup complete`
   - Monitor `[Vapi] Starting continuous playback` with buffer size
   - Watch for `[Vapi] Dropping audio chunk` warnings

2. **Monitor Buffer Health**:
   - Buffer size should be between 20ms-300ms during playback
   - Should see smooth playback without frequent pauses

3. **Test Different Scenarios**:
   - Short phrases vs long sentences
   - Quiet vs loud audio
   - Different network conditions

## Next Steps

If issues persist:

1. **Reduce Buffer Threshold Further**:
   - Change `bufferThreshold` from 0.05 to 0.03 (30ms)
   - Change `minBufferSize` from 0.02 to 0.01 (10ms)
   - **Warning**: Lower thresholds = more cutouts if network is unstable

2. **Check Vapi Dashboard Settings**:
   - Review STT/TTS provider latency
   - Adjust endpointing parameters
   - Try different voice models

3. **Consider Alternative Approaches**:
   - Use Vapi's built-in widget (if latency is acceptable)
   - Use server-side audio processing
   - Implement adaptive bitrate based on network quality

## Configuration

Current settings in `src/services/vapi.js`:

```javascript
this.bufferThreshold = 0.05; // 50ms buffer before starting playback
this.maxBufferSize = 0.3; // 300ms max buffer
this.minBufferSize = 0.02; // 20ms minimum buffer
```

To reduce latency (but risk more cutouts), try:

```javascript
this.bufferThreshold = 0.03; // 30ms
this.maxBufferSize = 0.2; // 200ms
this.minBufferSize = 0.01; // 10ms
```

## Debugging

Enable verbose logging:

```javascript
// In vapi.js, add more console.log statements
console.log("[Vapi] Buffer size:", this.jitterBufferSize.toFixed(3) + "s");
console.log("[Vapi] Chunks in buffer:", this.jitterBuffer.length);
console.log("[Vapi] WebSocket buffer:", this.transportWs.bufferedAmount);
```

## Vapi Dashboard Recommendations

1. **STT Provider**: Use Deepgram or ElevenLabs (faster than OpenAI Whisper)
2. **TTS Provider**: Use ElevenLabs or PlayHT (faster than OpenAI TTS)
3. **Endpointing**:
   - Start Speaking Delay: 100ms
   - Stop Speaking Delay: 300ms
   - Enable Smart Endpointing
4. **Voice Settings**:
   - Use faster voice models
   - Reduce voice speed if needed (but this increases latency)

## Support

If issues persist after trying these improvements:

1. Check Vapi documentation for best practices
2. Contact Vapi support with call logs
3. Review server logs for errors
4. Test with Vapi's example applications to compare latency

