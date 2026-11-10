if (!process.env.PRECISIGN_TURSO_TEST_URL || !process.env.PRECISIGN_TURSO_TEST_TOKEN) {
  throw new Error('Set PRECISIGN_TURSO_TEST_URL and PRECISIGN_TURSO_TEST_TOKEN to run the Turso API tests.');
}
