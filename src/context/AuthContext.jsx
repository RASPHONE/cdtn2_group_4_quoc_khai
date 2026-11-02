import React, { createContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const AuthContext = createContext()

// Shape the Supabase Auth user into what the rest of the app already uses:
// { id, email, name, role }. The role lives in app_metadata, which only the
// secret/service key can change (see scripts/seed-users.js).
const toAppUser = (authUser) => {
  if (!authUser) return null
  return {
    id: authUser.id,
    email: authUser.email,
    name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '',
    role: authUser.app_metadata?.role === 'admin' ? 'admin' : 'user',
  }
}

const friendlyError = (err) => {
  const msg = err?.message || ''
  if (/invalid login credentials/i.test(msg)) return 'Email hoac mat khau khong dung'
  if (/email not confirmed/i.test(msg)) return 'Vui long xac nhan email truoc khi dang nhap'
  if (/already registered|already been registered/i.test(msg)) return 'Email da duoc dang ky'
  return msg || 'Da xay ra loi'
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Clean up the old self-made session from before the Supabase Auth move.
    try { localStorage.removeItem('thuys_user') } catch { /* ignore */ }

    supabase.auth.getSession().then(({ data }) => {
      setUser(toAppUser(data.session?.user))
      setIsLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAppUser(session?.user))
    })
    return () => subscription.unsubscribe()
  }, [])

  const login = async (email, password) => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      const appUser = toAppUser(data.user)
      setUser(appUser)
      return { success: true, user: appUser }
    } catch (err) {
      const message = friendlyError(err)
      setError(message)
      return { success: false, error: message }
    } finally {
      setIsLoading(false)
    }
  }

  const register = async ({ name, email, password }) => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: window.location.origin,
        },
      })
      if (error) throw error

      // With "Confirm email" turned on, Supabase returns no session until the
      // user clicks the link in their inbox.
      if (!data.session) {
        return {
          success: true,
          needsConfirmation: true,
          message: 'Da gui email xac nhan. Vui long kiem tra hop thu roi dang nhap.',
        }
      }

      const appUser = toAppUser(data.user)
      setUser(appUser)
      return { success: true, user: appUser }
    } catch (err) {
      const message = friendlyError(err)
      setError(message)
      return { success: false, error: message }
    } finally {
      setIsLoading(false)
    }
  }

  // Re-checks the current password, then sets a new one.
  const changePassword = useCallback(async (currentPassword, newPassword) => {
    if (!user?.email) return { success: false, error: 'Chua dang nhap' }
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError) return { success: false, error: 'Mat khau hien tai khong dung' }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) return { success: false, error: friendlyError(updateError) }
    return { success: true }
  }, [user?.email])

  const logout = async () => {
    setError(null)
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isAdmin: user?.role === 'admin',
      isLoading,
      error,
      login,
      register,
      changePassword,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  )
}
