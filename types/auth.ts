export interface User {
  id: string
  email: string
  name?: string
}

export interface Room {
  id: string
  name: string
  host_id: string
  created_at: string
  daily_room_name: string
  is_active: boolean
}

export interface RoomParticipant {
  room_id: string
  user_id?: string
  role: 'host' | 'guest'
  session_id?: string
  joined_at: string
}