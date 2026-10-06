fetch("http://localhost:3000/invites/as8YlNglTKa9fsEwfdFUmU_YFP-s5ChD7-E0zS8Ekjo", {
  "headers": {
    "accept": "*/*",
    "origin": "http://localhost:4200"
  },
  "method": "GET",
  "mode": "cors"
}).then(r => console.log(r.status, r.headers.get("access-control-allow-origin"))).catch(e => console.log(e.message));
