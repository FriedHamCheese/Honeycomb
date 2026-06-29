import {MainSideNavbar} from './mainSideNavbar.jsx';
import {CreateDevicePopup} from './CreateDevicePopup.jsx';
import {ErrorPopup} from './Popups.jsx';

import {useState, useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router';
import styles from './Home.module.css';
import {BsQuestionCircle, BsPlusSquareFill } from "react-icons/bs";

function Home({
  APIBaseURL, 
  selectedPage, 
  baseURLToDevicePage, 
  URLToLoginPage, 
  paramsForMainSideNavbar, 
  getUserSessionToken, 
  clearUserSessionToken
}){  
  const navigate = useNavigate();

  const [devices, setDevices] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [showCreateDevicePopup, setShowCreateDevicePopup] = useState(false);
  const userSessionToken = getUserSessionToken();
  
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
      return setErrorMessage(String(err));
    }

    const invalidSessionToken = response.status === 401;
    if(invalidSessionToken) navigate(URLToLoginPage);    
    if(!(response.ok))
      return setErrorMessage(`Server responded with HTTP status ${response.status}.`);
    
    try{
      const objectFromResponse = await response.json();
      if(!(objectFromResponse.devices instanceof Array))
        return setErrorMessage("Server response .devices attribute not Array.");
      
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
  
  const DeviceContainers = useMemo(() => {
    return (
      <div className={styles.canvas}>
        {
          devices.map(deviceObject => 
            <button 
              className={styles.deviceObjectContainer} 
              onClick={() => navigate(baseURLToDevicePage + deviceObject.deviceID)}
              key={deviceObject.deviceID}
            >
              <h2 className={styles.deviceName}>{deviceObject.deviceName}</h2>
              <p className={styles.deviceID}>device ID: {deviceObject.deviceID}</p>
              {deviceObject.isCompositeDevice ? <p className={styles.compositeDeviceIcon}>Composite</p> : null}
            </button>
          )
        }
      </div>      
    );
  }, [devices]);
  
  const callOnRerender = [];
  useEffect(() => {
    getDevices();
  }, callOnRerender);
    
  return (
    <div>
      {
        showCreateDevicePopup && 
        <CreateDevicePopup 
          APIBaseURL={APIBaseURL} closeSelf={() => setShowCreateDevicePopup(false)}
        />
      }
      <ErrorPopup text={errorMessage} closeSelf={() => setErrorMessage("")}/>
      <MainSideNavbar 
        selectedPage={selectedPage} params={paramsForMainSideNavbar} clearUserSessionToken={clearUserSessionToken}
      />
      <div className={styles.topbar}>
        <h1 className={styles.topbarTitle}>Devices</h1>
        <button className={styles.addDeviceButton} onClick={() => setShowCreateDevicePopup(true)}>
          <BsPlusSquareFill/>
        </button>
      </div>
      {DeviceContainers}
    </div>
  );
}

export default Home;
