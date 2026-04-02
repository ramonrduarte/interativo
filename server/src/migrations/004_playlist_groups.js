exports.up = async function (knex) {
  await knex.schema.createTable('playlist_groups', t => {
    t.increments('id').primary()
    t.integer('company_id')
    t.string('name').notNullable()
    t.text('description')
    t.string('created_at')
  })

  await knex.schema.createTable('playlist_group_items', t => {
    t.increments('id').primary()
    t.integer('group_id').notNullable()
    t.integer('playlist_id').notNullable()
    t.integer('position').defaultTo(0)
    t.string('created_at')
  })

  await knex.schema.alterTable('screens', t => {
    t.integer('playlist_group_id')
  })

  // Migrate: for each screen with playlist_id, create a group containing that playlist
  const screens = await knex('screens').whereNotNull('playlist_id')
  const now = new Date().toISOString()

  for (const screen of screens) {
    const playlist = await knex('playlists').where({ id: screen.playlist_id }).first()
    if (!playlist) continue

    const [group] = await knex('playlist_groups').insert({
      company_id:  screen.company_id,
      name:        playlist.name,
      description: 'Migrado automaticamente',
      created_at:  now,
    }).returning('*')

    await knex('playlist_group_items').insert({
      group_id:    group.id,
      playlist_id: screen.playlist_id,
      position:    0,
      created_at:  now,
    })

    await knex('screens').where({ id: screen.id }).update({ playlist_group_id: group.id })
  }
}

exports.down = async function (knex) {
  await knex.schema.alterTable('screens', t => t.dropColumn('playlist_group_id'))
  await knex.schema.dropTableIfExists('playlist_group_items')
  await knex.schema.dropTableIfExists('playlist_groups')
}
