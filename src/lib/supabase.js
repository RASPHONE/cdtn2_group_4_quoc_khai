import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
    'Set them in .env (local) or in Vercel > Project Settings > Environment Variables.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Helper functions
export const supabaseDb = {
  // Users
  async login(email, password) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single()
    return { data, error }
  },

  async register(email, password, name) {
    const { data, error } = await supabase
      .from('users')
      .insert([{ email, password, name, role: 'user' }])
      .select()
      .single()
    return { data, error }
  },

  async getUserByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single()
    return { data, error }
  },

  async updateUser(id, updates) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  },

  // Services
  async getServices() {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('created_at')
    return { data, error }
  },

  // Designs
  async getDesigns() {
    const { data, error } = await supabase
      .from('designs')
      .select('*')
      .order('created_at')
    return { data, error }
  },

  async addDesign(design) {
    const { data, error } = await supabase
      .from('designs')
      .insert([{ ...design, is_custom: true }])
      .select()
      .single()
    return { data, error }
  },

  async deleteDesign(id) {
    const { error } = await supabase
      .from('designs')
      .delete()
      .eq('id', id)
    return { error }
  },

  // Bookings
  async getBookings() {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false })
    return { data, error }
  },

  async getBookingsByEmail(email) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_email', email)
      .order('created_at', { ascending: false })
    return { data, error }
  },

  async createBooking(booking) {
    const { data, error } = await supabase
      .from('bookings')
      .insert([booking])
      .select()
      .single()
    return { data, error }
  },

  async updateBookingStatus(id, status) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .select()
      .single()
    return { data, error }
  },

  async deleteBooking(id) {
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id)
    return { error }
  },

  // Blocked Dates
  async getBlockedDates() {
    const { data, error } = await supabase
      .from('blocked_dates')
      .select('*')
      .order('blocked_date')
    return { data, error }
  },

  async addBlockedDate(blockedDate) {
    const { data, error } = await supabase
      .from('blocked_dates')
      .insert([blockedDate])
      .select()
      .single()
    return { data, error }
  },

  async removeBlockedDate(id) {
    const { error } = await supabase
      .from('blocked_dates')
      .delete()
      .eq('id', id)
    return { error }
  },

  // Blocked Times
  async getBlockedTimes() {
    const { data, error } = await supabase
      .from('blocked_times')
      .select('*')
    return { data, error }
  },

  async addBlockedTime(blockedTime) {
    const { data, error } = await supabase
      .from('blocked_times')
      .insert([blockedTime])
      .select()
      .single()
    return { data, error }
  },

  async removeBlockedTime(id) {
    const { error } = await supabase
      .from('blocked_times')
      .delete()
      .eq('id', id)
    return { error }
  },

  // Salon Info
  async getSalonInfo() {
    const { data, error } = await supabase
      .from('salon_info')
      .select('*')
    return { data, error }
  },

  async updateSalonInfo(key, value) {
    try {
      // Check if exists first
      const { data: existing } = await supabase
        .from('salon_info')
        .select('id')
        .eq('key', key)
        .single()

      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('salon_info')
          .update({ value, updated_at: new Date().toISOString() })
          .eq('key', key)
          .select()
          .single()
        return { data, error }
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('salon_info')
          .insert([{ key, value }])
          .select()
          .single()
        return { data, error }
      }
    } catch (e) {
      return { data: null, error: e }
    }
  }
}
