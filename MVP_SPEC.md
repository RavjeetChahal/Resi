# Resi MVP Specification

## Product Overview

**Resi** is a voice-first campus residential issue reporting and management platform. Students report maintenance and residential life issues through natural voice conversations, while campus teams receive organized, prioritized tickets in real-time dashboards.

---

## Core User Roles

### 1. **Resident** (Student)
- Primary interface: Voice chat
- Reports issues conversationally
- Tracks ticket status and queue position
- Receives voice responses from AI agent

### 2. **Maintenance Staff**
- Dashboard view of maintenance-related tickets
- Prioritized queue (HIGH → MEDIUM → LOW urgency)
- Status management (Open → In Progress → Closed)
- Real-time updates

### 3. **Resident Assistant (RA)**
- Dashboard view of resident life tickets
- Same queue management as Maintenance
- Handles non-maintenance issues (noise complaints, roommate conflicts, etc.)

---

## MVP Feature Set

### ✅ **Authentication & Onboarding**

- [x] Role selection screen (Resident, Maintenance, RA)
- [x] Email/password authentication via Firebase
- [x] Campus email validation (@umass.edu)
- [x] Secure session management
- [x] Role-based navigation (Home for residents, Dashboard for staff)

### ✅ **Resident Experience**

#### Voice Reporting
- [x] Microphone permission handling (web + mobile)
- [x] Tap-to-record voice interface
- [x] Speech-to-text transcription (OpenAI Whisper)
- [x] Conversational AI agent (GPT-4)
- [x] Text-to-speech responses (playback on web + native)
- [x] Multi-turn conversations (context preservation)

#### Ticket Tracking
- [x] View all submitted tickets
- [x] See ticket status (Open, In Progress, Closed)
- [x] Queue position display (#1, #2, etc.)
- [x] Urgency level (HIGH, MEDIUM, LOW)
- [x] Location, timestamp, and routing info
- [x] Start new chat from ticket list

### ✅ **Staff Dashboard**

#### Queue Management
- [x] Real-time ticket list (auto-updates via Firebase)
- [x] Auto-sort by urgency + timestamp
- [x] Filter by urgency level
- [x] Team-specific routing (Maintenance vs RA)
- [x] Queue position synchronization

#### Ticket Operations
- [x] View detailed ticket info (summary, location, urgency, reporter)
- [x] Update ticket status
  - Open → In Progress
  - In Progress → Closed
  - Re-open closed tickets
- [x] Auto-hide closed tickets after 7 seconds
- [x] Status change confirmation

#### Dashboard Metrics
- [x] Open ticket count (live)
- [x] Team focus indicator (Maintenance vs RA)
- [x] Last updated timestamp
- [x] Logout functionality

### ✅ **Backend & AI**

#### API & Infrastructure
- [x] Express.js server (deployed on Render)
- [x] CORS enabled for web + mobile
- [x] Health check endpoint (`/health`)
- [x] Multipart form upload handling

#### AI Processing Pipeline
- [x] Audio transcription (Whisper API)
- [x] Issue classification (GPT-4)
  - Category: Maintenance vs Resident Life
  - Issue type: Plumbing, Electrical, Noise, etc.
  - Urgency: HIGH, MEDIUM, LOW
  - Location extraction
- [x] Conversational context management
- [x] TTS response generation (OpenAI TTS)

#### Data Persistence
- [x] Firebase Realtime Database
- [x] Ticket storage with owner (userId)
- [x] Conversation history per session
- [x] Queue position management
- [x] Team routing (maintenance vs ra)

### ✅ **Cross-Platform Support**

- [x] React Native for iOS/Android
- [x] Web support (Expo Web)
- [x] Platform-specific audio handling
- [x] Responsive UI across devices
- [x] Production deployment (Render)

---

## Technical Architecture

### **Frontend Stack**
- React Native 0.81
- Expo SDK 54
- React Navigation 7
- Firebase SDK
- Expo AV (audio recording)
- Axios (API calls)

### **Backend Stack**
- Node.js + Express
- OpenAI API (Whisper, GPT-4, TTS)
- Firebase Admin SDK
- Formidable (file uploads)

### **Infrastructure**
- Hosting: Render (frontend + backend)
- Database: Firebase Realtime Database
- Auth: Firebase Authentication
- Storage: Firebase (for tickets)

---

## User Flows

### 🎤 **Resident: Report an Issue**

1. User logs in as **Resident**
2. Lands on **Home Screen** (past tickets or empty state)
3. Taps **"Start New Chat"** or goes directly to Chat
4. Taps **"Start Voice Report"** button
5. Speaks naturally: _"There's water leaking from the ceiling in my room"_
6. Taps **"Stop & Submit"**
7. AI transcribes, classifies, and responds with:
   - Ticket confirmation
   - Estimated queue position
   - Voice reply via TTS
8. User can view ticket on **Home Screen**
   - Shows status, urgency, location, queue position
   - Routed to correct team (Maintenance or RA)

### 📊 **Staff: Manage Tickets**

1. User logs in as **Maintenance** or **RA**
2. Lands on **Dashboard Screen**
3. Sees prioritized ticket queue
   - AUTO-SORTED: HIGH urgency first, then oldest first
   - TEAM-FILTERED: Only maintenance or RA tickets
4. Taps ticket to expand details
5. Updates status:
   - **"Mark In Progress"** → Working on it
   - **"Mark Closed"** → Issue resolved
6. Ticket disappears from queue after 7 seconds (if closed)
7. Queue positions auto-update in real-time

---

## Key Differentiators

✅ **Voice-First**: No typing required—students speak naturally  
✅ **AI-Powered**: Auto-classification, routing, and prioritization  
✅ **Real-Time**: Live updates via Firebase (no refresh needed)  
✅ **Team-Specific**: Maintenance and RA see only relevant tickets  
✅ **Queue Transparency**: Students see their position in line  
✅ **Multi-Platform**: Works on iOS, Android, and Web  

---

## MVP Success Metrics

1. **Adoption**: 100+ students submit at least 1 ticket
2. **Response Time**: Average time to "In Progress" < 30 minutes
3. **Resolution Rate**: 80% of tickets closed within 48 hours
4. **User Satisfaction**: Voice interface rated 4+ stars
5. **Staff Efficiency**: Dashboard reduces ticket processing time by 40%

---

## Post-MVP Enhancements (Future Roadmap)

### 🚀 **Phase 2: Enhanced Resident Features**
- [ ] Push notifications for status updates
- [ ] Photo/video attachments
- [ ] Rate the resolution (5-star feedback)
- [ ] Recurring issue detection

### 🚀 **Phase 3: Advanced Staff Tools**
- [ ] Ticket assignment (assign to specific staff member)
- [ ] Bulk operations (close multiple tickets)
- [ ] Staff-to-staff chat
- [ ] Analytics dashboard (avg resolution time, top issues, etc.)
- [ ] Export reports (CSV, PDF)

### 🚀 **Phase 4: Admin Console**
- [ ] User management (add/remove staff)
- [ ] Role permissions
- [ ] System settings
- [ ] Audit logs

### 🚀 **Phase 5: Integrations**
- [ ] Campus facilities management systems
- [ ] Calendar integration (schedule maintenance windows)
- [ ] Email notifications
- [ ] SMS alerts for urgent issues

---

## Current Status: ✅ **MVP COMPLETE**

All core MVP features are **implemented and functional**:
- ✅ Voice recording + transcription
- ✅ AI classification + routing
- ✅ Real-time dashboards
- ✅ Queue management
- ✅ Cross-platform support
- ✅ Production deployment

### 🎯 Next Steps for Launch:

1. **Testing**
   - [ ] End-to-end user testing (10-20 students)
   - [ ] Staff onboarding and training
   - [ ] Load testing (100+ concurrent users)

2. **Polish**
   - [ ] Error handling improvements
   - [ ] Loading states and animations
   - [ ] Accessibility (screen readers, voice-over)
   - [ ] Offline mode handling

3. **Marketing**
   - [ ] Create demo video
   - [ ] Onboarding guide for students
   - [ ] Staff training materials
   - [ ] Campus partnership outreach

4. **Monitoring**
   - [ ] Set up analytics (Mixpanel, Amplitude)
   - [ ] Error tracking (Sentry)
   - [ ] Performance monitoring (Firebase Performance)
   - [ ] Usage dashboards

---

## Contact & Support

- **Product Name**: Resi
- **Platform**: iOS, Android, Web
- **Backend**: https://resi-7125.onrender.com
- **Tech Stack**: React Native, Firebase, OpenAI, Node.js

---

**Last Updated**: November 10, 2025





