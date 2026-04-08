exports.up = async function (knex) {
  await knex.schema.table('schedules', table => {
    table.integer('interval_minutes').nullable()  // if set: periodic mode — repeat every N minutes
    table.integer('interval_duration').nullable() // how long each occurrence lasts (in minutes)
    table.string('date_from').nullable()          // YYYY-MM-DD — start of calendar range
    table.string('date_to').nullable()            // YYYY-MM-DD — end of calendar range
  })
}

exports.down = async function (knex) {
  await knex.schema.table('schedules', table => {
    table.dropColumn('interval_minutes')
    table.dropColumn('interval_duration')
    table.dropColumn('date_from')
    table.dropColumn('date_to')
  })
}
