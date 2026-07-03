import styles from './Register.module.css';

import {BsBan} from 'react-icons/bs';
import {useNavigate} from 'react-router';
import {useState} from 'react';

export default function Login({APIBaseURL, URLToLoginPage}){
  const FIRST_CHARACTER = 0;
  const MAX_NAME_CHARACTERS = 32;
  const MAX_EMAIL_CHARACTERS = 48;
  const MAX_PASSWORD_CHARACTERS = 32;
  
  const [errorMessage, setErrorMessage] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  
  const navigate = useNavigate();
  
  async function register(){
    const truncatedName = nameInput.substr(FIRST_CHARACTER, MAX_NAME_CHARACTERS).trim();
    const truncatedEmail = emailInput.substr(FIRST_CHARACTER, MAX_EMAIL_CHARACTERS).trim();
    const truncatedPassword = passwordInput.substr(FIRST_CHARACTER, MAX_PASSWORD_CHARACTERS).trim();
    const truncatedConfirmPassword = confirmPasswordInput.substr(FIRST_CHARACTER, MAX_PASSWORD_CHARACTERS).trim();
    
    if(!truncatedName) return setErrorMessage("Name field is empty.");
    if(!truncatedEmail) return setErrorMessage("Email field is empty.");
    if(!truncatedPassword) return setErrorMessage("Password field is empty.");
    
    if(truncatedPassword != truncatedConfirmPassword)
      return setErrorMessage("Passwords do not match.");
    
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/user/register`, {
        method: "post",
        headers:{
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: truncatedName,
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
      navigate(URLToLoginPage);
    }catch(err){
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
        const pressedEnterKey = htmlEvent.key === "Enter";
        if(pressedEnterKey) await register();
      }}>
        <div className={styles.brandDiv}>
          <img src="/honeycomb.png" className={styles.icon}/>
          <label className={styles.welcomeText}>Welcome to Honeycomb!</label>
        </div>
        <h1>Register</h1>
        <input 
          className={styles.emailInput} 
          placeholder="Name" 
          type="text"
          value={nameInput}
          onChange={(htmlEvent) => {setNameInput(htmlEvent.target.value)}}
        />       
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
        <input 
          className={styles.passwordInput} 
          placeholder="Confirm password" 
          type="password"
          value={confirmPasswordInput}
          onChange={(htmlEvent) => {setConfirmPasswordInput(htmlEvent.target.value)}}
        />        
        {
          errorMessage &&
          <div className={styles.errorDiv}>
            <BsBan className={styles.errorIcon}/>
            <label className={styles.errorText}>{errorMessage}</label>
          </div>
        }
        <a href={URLToLoginPage} className={styles.loginLink}><u>Already got an account? Login here!</u></a>
        <button className={styles.loginButton} onClick={() => register()}>Register</button>
      </div>
    </div>
  );
}