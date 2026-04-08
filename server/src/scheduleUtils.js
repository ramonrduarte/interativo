/**
 * Shared schedule-matching logic used by both the scheduler (tick) and
 * socket.js (buildPayload). Handles:
 *   - day-of-week filter (days array)
 *   - calendar date-range filter (date_from / date_to)
 *   - time window (start_time / end_time, HH:MM strings)
 *   - periodic interval mode (interval_minutes / interval_duration)
 */
function isScheduleActiveNow(s, now) {
  if (s.active != 1) return false

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const currentTime = `${hh}:${mm}`
  const currentDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')

  // Calendar date-range filter
  if (s.date_from && currentDate < s.date_from) return false
  if (s.date_to   && currentDate > s.date_to)   return false

  // Day-of-week filter (ignored when days array is empty — means "every day")
  const days = Array.isArray(s.days) ? s.days : []
  if (days.length > 0 && !days.includes(now.getDay())) return false

  // Must be within the time window
  if (currentTime < s.start_time || currentTime >= s.end_time) return false

  // Periodic interval mode: only active during the show window within each cycle
  if (s.interval_minutes && s.interval_duration) {
    const [sh, sm] = s.start_time.split(':').map(Number)
    const elapsedMins = now.getHours() * 60 + now.getMinutes() - (sh * 60 + sm)
    return (elapsedMins % s.interval_minutes) < s.interval_duration
  }

  return true
}

module.exports = { isScheduleActiveNow }
