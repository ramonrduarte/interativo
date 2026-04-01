exports.up = async function (knex) {
  await knex.schema.createTable('layouts', t => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.string('template').notNullable()
    t.integer('zone_count').defaultTo(1)
    t.string('orientation').defaultTo('landscape')
    t.text('config')
    t.string('created_at')
  })

  await knex.schema.createTable('media', t => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.string('type').notNullable()
    t.string('filename')
    t.text('url')
    t.text('content')
    t.string('mime_type')
    t.bigInteger('file_size')
    t.string('object_fit').defaultTo('cover')
    t.string('created_at')
  })

  await knex.schema.createTable('playlists', t => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.text('description')
    t.string('created_at')
  })

  await knex.schema.createTable('tickers', t => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.text('messages')
    t.integer('speed').defaultTo(60)
    t.integer('font_size').defaultTo(32)
    t.string('color').defaultTo('#ffffff')
    t.string('bg_color').defaultTo('#dc2626')
    t.string('created_at')
  })

  await knex.schema.createTable('screens', t => {
    t.increments('id').primary()
    t.string('name').notNullable()
    t.string('token').notNullable()
    t.integer('playlist_id')
    t.integer('ticker_id')
    t.string('orientation').defaultTo('landscape')
    t.string('created_at')
  })

  await knex.schema.createTable('playlist_slides', t => {
    t.increments('id').primary()
    t.integer('playlist_id').notNullable()
    t.integer('layout_id')
    t.text('zone_content')
    t.integer('position').defaultTo(0)
    t.integer('duration').defaultTo(10)
    t.string('created_at')
  })

  await knex.schema.createTable('schedules', t => {
    t.increments('id').primary()
    t.integer('screen_id').notNullable()
    t.integer('playlist_id').notNullable()
    t.string('name')
    t.text('days')
    t.string('start_time')
    t.string('end_time')
    t.integer('priority').defaultTo(0)
    t.integer('active').defaultTo(1)
    t.string('created_at')
  })
}

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('schedules')
  await knex.schema.dropTableIfExists('playlist_slides')
  await knex.schema.dropTableIfExists('screens')
  await knex.schema.dropTableIfExists('tickers')
  await knex.schema.dropTableIfExists('playlists')
  await knex.schema.dropTableIfExists('media')
  await knex.schema.dropTableIfExists('layouts')
}
