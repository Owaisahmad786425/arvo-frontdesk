const c = require("../controllers/MessageController");
module.exports = (router) =>
  router.route("/tickets/:id/messages").get(c.list).post(c.create);
