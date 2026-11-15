import express from 'express';
export const userRouter = express.Router();

userRouter.post(
  "/register",
  async function(request, response){
    try {
      const userRegistrationResponse = await fetch(
        "http://localhost:5100/apiv1/user/register",
        {
          headers: {'content-type': 'application/json'},
          keepalive: true,
          method: 'post',
          body: JSON.stringify(request.body),
        }
      );
      try {
        return response.status(userRegistrationResponse.status).send(await userRegistrationResponse.json());
      } catch {
        return response.status(userRegistrationResponse.status).send();
      }
    } catch(error){
      if(error instanceof TypeError){
        console.log(error.message);
        return response.status(502).send({error: error.message});
      }
      throw error;
    }
  }
);

userRouter.post(
  "/login", 
  async function(request, response){
    try {
      const userAuthResponse = await fetch(
        "http://localhost:5100/apiv1/user/login",
        {
          headers: {
            'Authorization': request.headers.authorization,
            'content-type': 'application/json',
          },
          keepalive: true,
          method: 'post',
          body: JSON.stringify(request.body),
        }
      );
      if(userAuthResponse.ok){
        const objectFromResponse = await userAuthResponse.json();
        return response.send({loginToken: objectFromResponse.loginToken});
      }

      try {
        return response.status(userAuthResponse.status).send(await userAuthResponse.json());
      } catch {
        return response.status(userAuthResponse.status).send();
      }
    } catch(error){
      if(error instanceof TypeError){
        console.log(error.message);
        return response.status(502).send({error: error.message});
      }
      throw error;
    }
  }
);
