# Interview Studio

A powerful video editing webapp for managing and editing interview recordings with advanced features like participant focus, synchronized recording, and real-time transcription.

## Features

### ✨ Key Features
- **Multi-participant Recording**: Record multiple participants simultaneously using Daily.co
- **Focus System**: Select specific participants to highlight during interview segments with timeline-based editing
- **Video Editing Interface**: Advanced timeline controls with focus segments and smooth layout transitions
- **Real-time Transcription**: OpenAI Whisper integration for word-level timestamp transcription
- **Karaoke-style Captions**: Word highlighting synchronized with video playback
- **Synchronized Recording**: Coordinated recording start across all participants
- **Professional UI**: Modern interface with fixed video dimensions and responsive design

### 🛠 Tech Stack
- **Next.js 15.5** with React 19 and App Router
- **Daily.co API** for WebRTC and recording management
- **Supabase** for database and authentication
- **OpenAI Whisper** for AI-powered transcription
- **FFmpeg** for video-to-audio conversion
- **Tailwind CSS** with Radix UI components
- **TypeScript** for type safety

## Getting Started

### Prerequisites

- Node.js 18+ 
- Daily.co API account
- Supabase project
- OpenAI API key

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd interview-studio
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials:
```env
DAILY_API_KEY=your_daily_api_key_here
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

4. **Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

### Daily.co Setup
1. **Sign up** at [Daily.co](https://dashboard.daily.co/)
2. **Get API Key** from the Developers section
3. **Enable recordings** in your account settings

### Supabase Setup
1. **Create project** at [Supabase](https://supabase.com)
2. **Get URL and anon key** from project settings
3. **Set up authentication** (optional)

## Usage

### Recording Interviews

1. Create or join a room using the room interface
2. Start synchronized recording for all participants
3. Conduct your interview with multiple participants

### Editing Videos

1. Navigate to the edit page for your recording
2. Use the timeline to scrub through the video
3. Create focus segments by clicking and dragging on the focus timeline
4. Select which participant to focus on during specific time segments
5. View real-time captions with word highlighting

### Key Features

- **Focus Timeline**: Separate timeline below the main controls for creating focus segments
- **Click & Drag**: Create focus ranges with minimum 1-second duration
- **Layout Transitions**: Smooth animations between grid and single-participant layouts
- **Video Synchronization**: All recordings start simultaneously for perfect sync
- **Caption Overlay**: Real-time word highlighting based on transcription timestamps

## Project Structure

```
interview-studio/
├── app/                          # Next.js App Router
│   ├── page.tsx                 # Homepage
│   ├── room/[roomId]/page.tsx   # Recording room interface
│   ├── edit/[roomId]/page.tsx   # Video editing interface
│   ├── recordings/page.tsx      # Recordings management
│   ├── processing/[roomId]/     # Processing status page
│   └── api/                     # API Routes
│       ├── create-room/         # Room creation
│       ├── recordings/          # Recording management
│       │   ├── start/           # Start individual recording
│       │   ├── start-synchronized/ # Start synchronized recording
│       │   ├── stop/            # Stop recording
│       │   ├── transcribe/      # AI transcription
│       │   └── [roomName]/      # Get recording data
│       └── rooms/               # Room permissions
├── components/                  # Reusable UI components
│   ├── ui/                     # Radix UI components
│   └── AuthModal.tsx           # Authentication modal
├── contexts/                   # React contexts
├── lib/                        # Utilities and configurations
├── types/                      # TypeScript type definitions
└── public/                     # Static assets
```

## API Endpoints

### Recording Management
- `POST /api/recordings/start` - Start individual participant recording
- `POST /api/recordings/start-synchronized` - Start synchronized multi-participant recording
- `POST /api/recordings/stop` - Stop active recording
- `GET /api/recordings/[roomName]` - Get recording data for a specific room

### Transcription
- `POST /api/recordings/transcribe` - Transcribe video to text with word-level timestamps

### Room Management  
- `POST /api/create-room` - Create new Daily.co room with recording enabled
- `POST /api/rooms/[roomName]/permissions` - Update room permissions

## Development

### Building for Production

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```

## Deployment

### Vercel (Recommended)

1. **Push to GitHub**
2. **Connect repository** on Vercel
3. **Add environment variables**:
   - `DAILY_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY` (for transcription)
4. **Automatic deployment** on every push

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## Troubleshooting

### Common Issues

- **Recording not starting**: Check Daily.co API key and room configuration
- **Transcription failing**: Verify OpenAI API key and FFmpeg installation
- **Video sync issues**: Ensure all participants start recording simultaneously
- **Focus timeline not working**: Check that recordings have proper metadata

### Support

For issues or questions:
1. Check Daily.co documentation
2. Verify environment variables configuration
3. Check server logs for API errors
4. Ensure FFmpeg is properly installed for transcription

## License

This project is private and proprietary.
