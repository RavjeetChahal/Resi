# Resi: Voice-Enabled Maintenance Assistant for UMass
## 💡 Inspiration
UMass students told us dorm maintenance felt outdated — paper forms, phone calls, and emails that disappeared into the void. We built a faster, familiar way to report issues using just your voice.

## 💬 What It Does
Resi is a voice-driven maintenance and residential life assistant. Students describe an issue on web, iOS, or Android; Resi transcribes it, classifies it, and creates a structured ticket. It routes tasks to Maintenance or RAs, assigns queue positions, and keeps everyone updated through a live dashboard.

## 🧩 How We Built It
- Client: Expo / React Native app (web, iOS, Android) with role-based navigation and voice recording with live feedback.
- Backend: Node.js + Express on Render
    - OpenAI Whisper for transcription
    - GPT-4-Turbo for ticket classification and conversational logic
    - Real-time queue assignment and backfilling every 5s
    - Firebase Admin SDK for DB operations and ticket persistence
- Data & Auth: Firebase Realtime Database and UMass-restricted Firebase Authentication
- AI Layer: Context-aware conversation system that asks clarifying questions before creating tickets.
## ⚙️ Challenges
- Cross-device backend detection (localhost vs production)
- Preventing duplicate ticket creation
- Real-time queue synchronization
- Maintaining conversation context across sessions
- iOS audio playback with deprecated Expo AV APIs
- Deployment caching across Docker, Expo, and Cloudflare
## 🏆 Accomplishments
- Submit a maintenance request in < 1 minute using only voice
- AI-driven conversation flow with natural text-to-speech replies
- Shared RA/Maintenance dashboard with real-time updates
- Auto queue management syncing every 5 seconds
- Smart routing between Maintenance and RAs
## 📚 What We Learned
- Students prefer interfaces that feel like voice notes, not forms
- Context management defines perceived “intelligence”
- Fine-grained logging is vital for multi-API systems
- Mobile development requires dynamic networking configs
- Server-side queue logic is more reliable than client-side syncing
## 🚀 What’s Next
- Push notifications for ticket updates
- Image upload for issue reports
- Integration with existing systems (FMX, SchoolDude)
- Analytics dashboard for recurring issues
- Multi-language support
- Offline ticket caching
- Smart SLA-based escalation
## 🧠 Key Technical Highlights
- 🎙️ OpenAI Whisper transcription
- 🤖 GPT-4-Turbo conversational AI with memory
- 🔊 Text-to-speech replies
- 📱 Cross-platform Expo app
- ⚡ Real-time Firebase data sync
- 🎯 Automated queue routing
- 🚀 Deployed on Render with CI/CD
- 🔐 Role-based Firebase Authentication

## 🚀 Deployments
- Render: https://movemate-39ed.onrender.com/
- Amazon EC2: https://rezzy.tech/

## 👥 Contributors:
- [Rav](https://github.com/RavjeetChahal)
- [Vedant](https://github.com/vedantnaiduu)
- [Cameron](https://github.com/proulxdev)