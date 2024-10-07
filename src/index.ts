import { EneraAsteriskApiServer } from "./api.js";
import { Server } from "./server.js";
import { Main } from "./Main.js";

const main = async () => {

  const main = await Main.create('mongodb://localhost:27017', 'enera-asterisk')
  await main.ready()

  const eneraAsteriskApiServer = new EneraAsteriskApiServer()
  new Server(eneraAsteriskApiServer)
}

main()