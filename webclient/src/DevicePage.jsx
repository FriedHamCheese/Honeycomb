import {MainSideNavbar} from './mainSideNavbar.jsx';
import {ErrorPopup} from './Popups.jsx';

import {useState, useEffect, useMemo} from 'react';
import {useNavigate, useParams} from 'react-router';

import styles from './DevicePage.module.css';

export default function DevicePage({
  APIBaseURL, URLToLoginPage, getUserSessionToken, clearUserSessionToken
}) {
  const linkParameters = useParams();  
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceObject, setDeviceObject] = useState();
  const [datapoints, setDatapoints] = useState();
  
  const [deviceDataLabels, setDeviceDataLabels] = useState([]);
  const [deviceRows, setDeviceRows] = useState([]);
  const [latestDatapoint, setLatestDatapoint] = useState();
  const [refreshObject, setRefreshObject] = useState({});
  const [activeTab, setActiveTab] = useState('dataLog');
  const navigate = useNavigate();
  
  function DatapointContainer({datapoint}){
    return(
      <tr className={styles.tableRow}>
        {datapoint.map((dataElement, index) => <td key={index} className={styles.table}>{dataElement}</td>)}
      </tr>
    );
  }
  
  async function getDeviceInfo(){
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/device/${linkParameters.deviceIDStr}`, {
        headers:{
          authorization: getUserSessionToken()
        }
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't connect to server.");
      return setErrorMessage(String(err));
    }
    
    const invalidSessionToken = response.status === 401;
    if(invalidSessionToken) navigate(URLToLoginPage);
    
    if(!(response.ok))
      return setErrorMessage(`Received HTTP status ${response.status} from server.`);
    
    try{
      const objectFromResponse = await response.json();
      if(!(objectFromResponse.table instanceof Array))
        return setErrorMessage(".table attribute from server not array type.");

      setDeviceObject(objectFromResponse);
      if (objectFromResponse.table.length < 1)
        setDeviceDataLabels([]);
      else setDeviceDataLabels(Object.keys(objectFromResponse.table[0]));
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Could not read response.");
      if(err instanceof TypeError)
        return setErrorMessage("Cannot parse response as JSON.");
      return setErrorMessage(String(err));
    }
    setErrorMessage("");
  }
  
  function getDatapointsAlignedToDataLabels(deviceTable, dataLabels){
    const alignedDatapoints = [];
    for(const datapoint of deviceTable){
      if(!(datapoint instanceof Object)){
        console.log(`$Datapoint {datapoint} not Object, skipping...`);
        continue;
      }
      
      const alignedDatapoint = [];
      for(const dataLabel of dataLabels)
        alignedDatapoint.push(datapoint[dataLabel]); 
      alignedDatapoints.push(alignedDatapoint);
    }
    return alignedDatapoints;
  }
  
  const callOnRerender = [];
  useEffect(() => {getDeviceInfo()}, callOnRerender);

  useEffect(() => {
    const msPerRefresh = 2000;
    const timerID = setTimeout(function (){
      getDeviceInfo();
      setRefreshObject({});
    }, msPerRefresh);

    return function (){clearTimeout(timerID);}
  }, [refreshObject]);

  useEffect(() => {
    if(activeTab !== 'dashboard') return;

    let cancelled = false;
    async function getLatestDatapoint(){
      let response;
      try{
        response = await fetch(`${APIBaseURL}/apiv1/device/${linkParameters.deviceIDStr}/latest`, {
          headers: {authorization: getUserSessionToken()}
        });
      }catch(err){
        if(cancelled) return;
        if(err instanceof TypeError)
          return setErrorMessage("Couldn't connect to server.");
        return setErrorMessage(String(err));
      }

      if(response.status === 401){
        navigate(URLToLoginPage);
        return;
      }
      if(!response.ok){
        return setErrorMessage(`Received HTTP status ${response.status} from server.`);
      }

      try{
        const objectFromResponse = await response.json();
        if(!(objectFromResponse.datapoint === null || objectFromResponse.datapoint instanceof Object))
          return setErrorMessage("Server response .datapoint not Object or null.");
        if(!cancelled){
          setLatestDatapoint(objectFromResponse.datapoint);
          setErrorMessage("");
        }
      }catch(err){
        if(cancelled) return;
        if(err instanceof TypeError)
          return setErrorMessage("Could not read response.");
        if(err instanceof SyntaxError)
          return setErrorMessage("Cannot parse response as JSON.");
        return setErrorMessage(String(err));
      }
    }

    getLatestDatapoint();
    const timerID = setInterval(getLatestDatapoint, 5000);
    return () => {
      cancelled = true;
      clearInterval(timerID);
    };
  }, [activeTab, APIBaseURL, URLToLoginPage, getUserSessionToken, linkParameters.deviceIDStr, navigate]);
  
  useEffect(() => {
    if(!deviceObject) return;
    if(!deviceObject.table !== datapoints)
      setDatapoints(deviceObject.table);
    
    setDeviceRows(getDatapointsAlignedToDataLabels(deviceObject.table, deviceDataLabels));
  }, [deviceObject])

  const DatapointsVisual = useMemo(function (){
    return deviceRows.map((datapoint) => <DatapointContainer datapoint={datapoint}/>)
  }, [deviceRows]);

  const nothingToDisplay = !deviceObject && !errorMessage;
  if(nothingToDisplay) return;
  
  return (
    <div>
      {<ErrorPopup text={errorMessage} closeSelf={async () => {
        setErrorMessage("");
        getDeviceInfo();
      }}/>}
      <MainSideNavbar 
        URLToLoginPage={URLToLoginPage} clearUserSessionToken={clearUserSessionToken}
      />
      {
        deviceObject && <div>
          <div className={styles.topbar}>
            <h1 className={styles.topbarTitle}>{deviceObject.deviceName}</h1>
            <p className={styles.deviceID}>device ID: {linkParameters.deviceIDStr}</p>
          </div>
          <div className={styles.canvas}>
            <div className={styles.tabs} role="tablist" aria-label="Device views">
              <button
                className={`${styles.tab} ${activeTab === 'dashboard' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('dashboard')}
                role="tab"
                aria-selected={activeTab === 'dashboard'}
                type="button"
              >
                Dashboard
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'dataLog' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('dataLog')}
                role="tab"
                aria-selected={activeTab === 'dataLog'}
                type="button"
              >
                Data Log
              </button>
              <button
                className={`${styles.tab} ${activeTab === 'settings' ? styles.activeTab : ''}`}
                onClick={() => setActiveTab('settings')}
                role="tab"
                aria-selected={activeTab === 'settings'}
                type="button"
              >
                Settings
              </button>
            </div>

            <div className={`${styles.tabPanel} ${activeTab === 'dashboard' ? styles.dashboardPanel : ''}`}>
              {activeTab === 'dashboard' ? <div className={styles.dashboardTabContent}>
                <div className={styles.dashboardFrame}>
                  <div className={styles.dashboard}>
                    <div className={styles.dashboardReading}>
                      <span className={styles.dashboardLabel}>Temperature</span>
                      <span className={styles.dashboardValue}>
                        {latestDatapoint?.temperature_celsius ?? '—'}
                        {latestDatapoint?.temperature_celsius !== undefined ? ' °C' : ''}
                      </span>
                    </div>
                    <div className={styles.dashboardReading}>
                      <span className={styles.dashboardLabel}>Relative humidity</span>
                      <span className={styles.dashboardValue}>
                        {latestDatapoint?.relative_humidity_percent ?? '—'}
                        {latestDatapoint?.relative_humidity_percent !== undefined ? ' %' : ''}
                      </span>
                    </div>
                    <div className={styles.dashboardReading}>
                      <span className={styles.dashboardLabel}>Epoch seconds</span>
                      <span className={styles.dashboardValue}>{latestDatapoint?.epoch_seconds ?? '—'}</span>
                    </div>
                  </div>
                </div>
              </div> : activeTab === 'dataLog' ? <>
                <table className={styles.dataTable}>
                  <thead>
                    <tr className={styles.tableHeaderRow}>
                      {deviceDataLabels.map((dataLabel) => <th key={dataLabel} className={styles.tableHeader}>{dataLabel}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {DatapointsVisual}
                  </tbody>
                </table>
              </> : <div className={styles.emptyTab}></div>}
            </div>
          </div>
        </div>
      }
    </div>
  );
}
