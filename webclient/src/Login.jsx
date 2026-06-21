import styles from './Login.module.css';
import {setUserSessionToken} from './globals.jsx';

import {BsBan} from 'react-icons/bs';
import {useNavigate} from 'react-router';
import {useState} from 'react';

export default function Login({APIBaseURL, baseURLForHomeRedirect, URLToRegisterPage}){
  const FIRST_CHARACTER = 0;
  const MAX_EMAIL_CHARACTERS = 48;
  const MAX_PASSWORD_CHARACTERS = 32;
  
  const [errorMessage, setErrorMessage] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  
  const navigate = useNavigate();
  
  async function login(){
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/user/login`, {
        method: "post",
        headers:{
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: emailInput.substr(FIRST_CHARACTER, MAX_EMAIL_CHARACTERS).trim(),
          password: passwordInput.substr(FIRST_CHARACTER, MAX_PASSWORD_CHARACTERS).trim(),
        })
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Unable to connect to server.");
      return setErrorMessage(String(err));
    }
    
    const doNotAttemptParseJSON = response.status === 404;
    if(doNotAttemptParseJSON)
      return setErrorMessage("Received HTTP status 404 from server.");
    
    try{
      const objectFromResponse = await response.json();
      if(objectFromResponse.error)
        return setErrorMessage(objectFromResponse.error);
      setUserSessionToken(objectFromResponse.loginToken);
      navigate(baseURLForHomeRedirect);
    }catch(err){
      console.log(err);
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't read response from server.");
      if(err instanceof SyntaxError)
        return setErrorMessage("Couldn't parse server response as JSON.");
      return setErrorMessage(String(err));
    }
    
    setErrorMessage("");
  }
  
  return (
    <div className={styles.background}>
      <div className={styles.loginBox}>
        <div className={styles.brandDiv}>
          <img src="/honeycomb.png" className={styles.icon}/>
          <label className={styles.welcomeText}>Welcome to Honeycomb!</label>
        </div>
        <h1>Login</h1>
        <input 
          className={styles.emailInput} 
          placeholder="Email address" 
          type="email"
          value={emailInput}
          onChange={(htmlEvent) => {setEmailInput(htmlEvent.target.value)}}
        />
        <input 
          className={styles.passwordInput} 
          placeholder="Password" 
          type="password"
          value={passwordInput}
          onChange={(htmlEvent) => {setPasswordInput(htmlEvent.target.value)}}
        />
        {
          errorMessage &&
          <div className={styles.errorDiv}>
            <BsBan className={styles.errorIcon}/>
            <label className={styles.errorText}>{errorMessage}</label>
          </div>
        }
        <a href={URLToRegisterPage} className={styles.registerLink}><u>New? Register here!</u></a>
        <button className={styles.loginButton} onClick={() => login()}>Log in</button>
      </div>
    </div>
  );
}