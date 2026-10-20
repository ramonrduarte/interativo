// Horário de funcionamento por tela (ligar/desligar), usado pelo app Android nativo.
// Formato (JSON): { enabled: bool, rules: [{ days: [0..6], on: "HH:MM", off: "HH:MM" }] }
exports.up = async function (knex) {
  await knex.schema.alterTable('screens', t => {
    t.text('power_schedule').nullable()
  })
}

exports.down = async function (knex) {
  await knex.schema.alterTable('screens', t => {
    t.dropColumn('power_schedule')
  })
}
