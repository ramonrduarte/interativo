exports.up = async function (knex) {
  await knex.schema.alterTable('media', t => {
    t.integer('video_duration').nullable()
  })
  await knex.schema.alterTable('playlist_slides', t => {
    t.boolean('use_video_duration').defaultTo(false)
  })
}

exports.down = async function (knex) {
  await knex.schema.alterTable('playlist_slides', t => {
    t.dropColumn('use_video_duration')
  })
  await knex.schema.alterTable('media', t => {
    t.dropColumn('video_duration')
  })
}
