import App from "./App.jsx";
import { createRoot } from 'react-dom/client'
import {Helmet} from 'react-helmet';

/*
  - logout button
  - composite device addition
  - loading states
*/

createRoot(document.getElementById('root')).render(
  <div>
    <Helmet>
      <title>Honeycomb</title>
      <link rel="icon" href="/honeycomb.png"/>
    </Helmet>
    <App/>
  </div>
)
