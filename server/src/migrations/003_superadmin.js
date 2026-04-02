// Upgrade the first-created user (lowest id) to superadmin.
// This is the main administrator of the installation.
exports.up = async function (knex) {
  const first = await knex('users').orderBy('id').first()
  if (first) await knex('users').where({ id: first.id }).update({ role: 'superadmin' })
}

exports.down = async function (knex) {
  const first = await knex('users').orderBy('id').first()
  if (first) await knex('users').where({ id: first.id }).update({ role: 'admin' })
}
