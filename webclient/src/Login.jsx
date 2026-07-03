import styles from './Login.module.css';

import {BsBan} from 'react-icons/bs';
import {useNavigate} from 'react-router';
import {useState} from 'react';

export default function Login({
  APIBaseURL, URLToHomePage, URLToRegisterPage, setUserSessionToken, getUserSessionToken
}){
  const FIRST_CHARACTER = 0;
  const MAX_EMAIL_CHARACTERS = 48;
  const MAX_PASSWORD_CHARACTERS = 32;
  
  const [errorMessage, setErrorMessage] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  
  const navigate = useNavigate();
  
  async function login(){
    const truncatedEmail = emailInput.substr(FIRST_CHARACTER, MAX_EMAIL_CHARACTERS).trim();
    const truncatedPassword = passwordInput.substr(FIRST_CHARACTER, MAX_PASSWORD_CHARACTERS).trim();
    const emailIsEmpty = !truncatedEmail;
    const passwordIsEmpty = !truncatedPassword;
    
    if(emailIsEmpty) return setErrorMessage("Email field is empty.");
    if(passwordIsEmpty) return setErrorMessage("Password field is empty.");

    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/user/login`, {
        method: "post",
        headers:{
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: truncatedEmail,
          password: truncatedPassword,
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
      if(!objectFromResponse.loginToken) 
        return setErrorMessage(".loginToken attribute server is empty. Please notify team.");
        
      setUserSessionToken(objectFromResponse.loginToken);
      navigate(URLToHomePage);
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
      <div className={styles.loginBox} onKeyDown={async function (htmlEvent){
        const pressedEnter = htmlEvent.key === "Enter";
        if(pressedEnter) login();
      }}>
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