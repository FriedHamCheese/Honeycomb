import {MainSideNavbar} from './mainSideNavbar.jsx';
import {ErrorPopup} from './Popups.jsx';
import {userSessionToken} from './globals.jsx';

import {useState, useEffect} from 'react';
import {useNavigate} from 'react-router';
import styles from './Home.module.css';

function Home({APIBaseURL, selectedPage, baseRedirectToDeviceLink, URLToLoginPage, paramsForMainSideNavbar}){  
  const navigate = useNavigate();

  const [devices, setDevices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  
  if(!userSessionToken) navigate(URLToLoginPage);
  
  async function getDevices(){
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/user/devicePreviews`, {
        headers: {
          'Authorization': userSessionToken
        }
      });
    }catch(err){
      if(err instanceof TypeError) return setErrorMessage("Unable to connect to server.");
      setErrorMessage(String(err));
    }
    
    if(!(response.ok))
      return setErrorMessage(`Server responded with HTTP status ${response.status}.`);
    
    try{
      const objectFromResponse = await response.json();
      setDevices(objectFromResponse.devices);
      setErrorMessage("");
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Could not read response.");
      if(err instanceof TypeError)
        return setErrorMessage("Cannot parse response as JSON.");
      setErrorMessage(String(err));
    }
  }
  
  const callOnRerender = [];
  useEffect(() => {
    getDevices();
  }, callOnRerender);
    
  return (
    <div>
      <ErrorPopup text={errorMessage} closeSelf={() => setErrorMessage("")}/>
      <MainSideNavbar selectedPage={selectedPage} params={paramsForMainSideNavbar}/>
      <div className={styles.topbar}>
        <h1 className={styles.topbarTitle}>Devices</h1>
      </div>
      <div className={styles.canvas}>
        {
          devices.map(deviceObject => 
            <button 
              className={styles.deviceObjectContainer} 
              onClick={() => navigate(baseRedirectToDeviceLink+ deviceObject.deviceID)}
              key={deviceObject.deviceID}
            >
              <h2 className={styles.deviceName}>{deviceObject.deviceName}</h2>
              <p className={styles.deviceID}>device ID: {deviceObject.deviceID}</p>
              {deviceObject.isCompositeDevice ? <p className={styles.compositeDeviceIcon}>Composite</p> : null}
            </button>
          )
        }
      </div>
    </div>
  );
}

export default Home;
