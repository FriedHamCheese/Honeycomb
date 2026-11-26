import {useEffect, useState} from 'react';
import styles from './CreateDevicePopup.module.css'

import {
  BsQuestionCircle, BsArrowLeftCircle, BsArrowRightCircleFill, BsPlusSquareFill, BsPlusCircle, BsTrash, BsCheckCircleFill 
} from "react-icons/bs";

import {v4 as uuidv4} from 'uuid';

export function CreateDevicePopup({APIBaseURL, closeSelf, userSessionToken}){  
  const PageID = {
    NAME_AND_SECRETS: 0,
    DATA_STRUCTURE: 1,
    SUCCESS_PAGE: 2,
  };

  const [deviceNameSecrets, setDeviceNameSecrets] = useState({name: "", deviceSecret: "", deviceViewingSecret: ""});
  const [dataStructure, setDataStructure] = useState([]);
  const [deviceDatatypes, setDeviceDatatypes] = useState([]);
  const [datatypesLoaded, setDatatypesLoaded] = useState(false);
  const [displayingPageID, setDisplayingPageID] = useState(PageID.NAME_AND_SECRETS);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const canGoPreviousPage = displayingPageID > 0;

  useEffect(() => {
    async function fetchDeviceDatatypes(){
      let response;
      try{
        response = await fetch(`${APIBaseURL}/apiv1/device/datatypes`);
      }catch(err){
        if(err instanceof TypeError)
          return setErrorMessage("Couldn't fetch datatypes allowed by server.");
        return setErrorMessage(String(err));
      }

      try{
        const datatypes = await response.json();
        if(!response.ok)
          return setErrorMessage(datatypes.error || `Received HTTP status ${response.status}.`);
        if(!Array.isArray(datatypes))
          return setErrorMessage("Received an invalid datatype list from server.");
        setDeviceDatatypes(datatypes);
        setDatatypesLoaded(true);
        setErrorMessage("");
      }catch(err){
        if(err instanceof TypeError)
          return setErrorMessage("Couldn't read response from server.");
        if(err instanceof SyntaxError)
          return setErrorMessage("Couldn't parse JSON from server response.");
        return setErrorMessage(String(err));
      }
    }

    fetchDeviceDatatypes();
  }, [APIBaseURL]);
  
  async function submitDevice(){
    function getObjectForDeviceSubmission(){
      let object = {};
      
      for(const dataElement of dataStructure){
        const datatype = deviceDatatypes.find(({requestedType}) => requestedType === dataElement.type);
        if(!datatype?.customSizeBoundary)
          object[dataElement.name] = dataElement.type;
        else
          object[dataElement.name] = `${dataElement.type}[${dataElement.size}]`;
      }

      object.__deviceName = deviceNameSecrets.name;
      object.__deviceSecret = deviceNameSecrets.deviceSecret;
      object.__deviceViewingSecret = deviceNameSecrets.deviceViewingSecret;
      return object;
    }
    
    let response;
    try{
      response = await fetch(`${APIBaseURL}/apiv1/device`, {
        method: "post",
        headers:{
          "content-type": "application/json",
          "authorization": userSessionToken,
        },
        body: JSON.stringify(getObjectForDeviceSubmission()),
      });
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't connect to server.");
      return setErrorMessage(String(err));
    }
    
    const errorWithNoJSON = response.status === 404;
    if(errorWithNoJSON)
      return setErrorMessage("Received HTTP status 404.");
    try{
      const objectFromResponse = await response.json();
      if(response.ok){
        setSuccessMessage(objectFromResponse.message);
        setDisplayingPageID(PageID.SUCCESS_PAGE);
      }else 
        setErrorMessage(objectFromResponse.error);
    }catch(err){
      if(err instanceof TypeError)
        return setErrorMessage("Couldn't read response from server.");
      if(err instanceof SyntaxError)
        return setErrorMessage("Couldn't parse JSON from server response.");
      return setErrorMessage(String(err));
    }
    setErrorMessage("");
  }

  return (
    <div className={styles.popupBackground}>
      <div className={styles.popupBox}>
        <button className={styles.popupCloseButton} onClick={() => closeSelf()}>X</button>
        <h1 className={styles.popupTitle}>Create a new device</h1>
        {
          (displayingPageID === PageID.NAME_AND_SECRETS) &&
          <DeviceNameSecretPage 
            deviceNameSecrets={deviceNameSecrets} 
            setDeviceNameSecrets={(value) => setDeviceNameSecrets(value)}/>
        }
        {
          (displayingPageID === PageID.DATA_STRUCTURE) &&
          <>
            <DeviceDatapointStructurePage
              dataStructure={dataStructure}
              setDataStructure={setDataStructure}
              deviceDatatypes={deviceDatatypes}
            />
            {!datatypesLoaded && <p>Loading supported data types...</p>}
          </>
        }
        {errorMessage && <p role="alert">{errorMessage}</p>}
        {
          (displayingPageID === PageID.SUCCESS_PAGE) &&
          <SuccessPage successMessage={successMessage}/>
        }
          <div style={{marginTop: "30px"}}>
            {
              (displayingPageID !== PageID.DATA_STRUCTURE && displayingPageID !== PageID.SUCCESS_PAGE) &&
              <button 
                className={styles.nextPopupPageButton} onClick={() => {setDisplayingPageID(displayingPageID+1)}}
              >
                <BsArrowRightCircleFill/>
              </button>
            }
            {
              (displayingPageID === PageID.DATA_STRUCTURE) &&
              <button 
                className={styles.nextPopupPageButton}
                onClick={submitDevice}
                disabled={!datatypesLoaded}
              >
                <BsCheckCircleFill />
              </button>
            }
            {
              <button 
                className={canGoPreviousPage ? styles.previousPopupPageButton : styles.previousPopupPageButtonDisabled} 
                onClick={() => {setDisplayingPageID(displayingPageID-1)}}
                disabled={!canGoPreviousPage}
              >       
                <BsArrowLeftCircle/>
              </button>
            }
          </div>
      </div>
    </div>
  );
}


function DeviceNameSecretPage({deviceNameSecrets, setDeviceNameSecrets}){
  const [showDeviceSecretHint, setShowDeviceSecretHint] = useState(false);
  const [showDeviceViewingSecretHint, setShowDeviceViewingSecretHint] = useState(false);

  const [hintAtPos, setHintAtPos] = useState({x: 0, y: 0});
  
  function showHintText(htmlEvent, hintIsVisible, setHintIsVisible){
    const makeHintVisible = !hintIsVisible;
    if(makeHintVisible){
      setHintAtPos({x: htmlEvent.clientX, y: htmlEvent.clientY});
      setHintIsVisible(true);
    }
  }
  
  return (
    <div>
      <div className={styles.createDeviceInputIconDiv}>
        <input
          placeholder="Device name"
          value={deviceNameSecrets.name}
          onChange={(htmlEvent) => setDeviceNameSecrets({...deviceNameSecrets, name: htmlEvent.target.value})}
          className={styles.createDeviceInput}
          title="This is mostly for you, we need at least 1 character for you to actually find the device"
        />
      </div>
      <div className={styles.createDeviceInputIconDiv}>
        <input
          placeholder="Device secret"
          value={deviceNameSecrets.deviceSecret}
          onChange={(htmlEvent) => setDeviceNameSecrets({...deviceNameSecrets, deviceSecret: htmlEvent.target.value})}
          className={styles.createDeviceInput}
          type="password"
        />
        <button 
          className={styles.createDeviceHelpIcon} 
          onMouseOver={(htmlEvent) => showHintText(htmlEvent, showDeviceSecretHint, setShowDeviceSecretHint)}
          onMouseOut={() => setShowDeviceSecretHint(false)}
        >
          <BsQuestionCircle />
        </button>
        {
          showDeviceSecretHint && 
          <p 
            className={styles.createDeviceHelpPopup} style={{left: hintAtPos.x + 10, top: hintAtPos.y + 10}}
          >This is used for authorizing datapoint reading and writing from the device.</p>
        }
      </div>
      <div className={styles.createDeviceInputIconDiv}> 
        <input
          placeholder="Device viewing secret"
          value={deviceNameSecrets.deviceViewingSecret}
          onChange={(htmlEvent) => setDeviceNameSecrets({...deviceNameSecrets, deviceViewingSecret: htmlEvent.target.value})}
          className={styles.createDeviceInput}
          type="password"
        />
        <button 
          className={styles.createDeviceHelpIcon}
          onMouseOver={(htmlEvent) => showHintText(htmlEvent, showDeviceViewingSecretHint, setShowDeviceViewingSecretHint)}
          onMouseOut={() => setShowDeviceViewingSecretHint(false)}
        >
          <BsQuestionCircle />
        </button>       
        {
          showDeviceViewingSecretHint && 
          <p 
            className={styles.createDeviceHelpPopup} style={{left: hintAtPos.x + 10, top: hintAtPos.y + 10}}
          >This is used for authorizing datapoint reading from the device 
            and other composite devices composed of the device.</p>
        }
      </div>
    </div>
  );
}

function DeviceDatapointStructurePage({dataStructure, setDataStructure, deviceDatatypes}){
  
  function DataElement({dataElement, removeSelf}){    
    const [update, setUpdate] = useState({});
  
    return(
      <div style={{width: "100%"}}>
        <button className={styles.dataElementRemoveButton} onClick={removeSelf}><BsTrash/></button>
        <input className={styles.dataTableHeader}
          onChange={(htmlEvent) => {
            dataElement.name = htmlEvent.target.value;
            setUpdate({});
          }}
          value={dataElement.name}
        />
        <select 
          className={styles.dataTableHeader} 
          onChange={(htmlEvent) => {
            dataElement.type = htmlEvent.target.value;
            const selectedDatatype = deviceDatatypes.find(
              ({requestedType}) => requestedType === dataElement.type
            );
            dataElement.size = selectedDatatype?.customSizeBoundary?.min ?? "";
            setUpdate({});
          }}          
          value={dataElement.type}
        >
          {
            deviceDatatypes.map((datatype) =>
              <option key={datatype.requestedType} value={datatype.requestedType}>
                {datatype.requestedType}
              </option>
            )
          }
        </select>
        <input 
          className={styles.dataTableHeader} 
          type="number"
          min={deviceDatatypes.find(({requestedType}) => requestedType === dataElement.type)?.customSizeBoundary?.min}
          max={deviceDatatypes.find(({requestedType}) => requestedType === dataElement.type)?.customSizeBoundary?.max}
          disabled={!deviceDatatypes.find(({requestedType}) => requestedType === dataElement.type)?.customSizeBoundary}
          onChange={(htmlEvent) => {
            dataElement.size = htmlEvent.target.value;
            setUpdate({});
          }}
          value={dataElement.size ?? ""}
        />
      </div>
    );
  }
  
  return (
    <div>
      <div className={styles.dataTable}>
        <div style={{width: "100%"}}>
          <button className={styles.dataElementRemoveButton} style={{visibility: "hidden"}}><BsTrash/></button>
          <h2 className={styles.dataTableHeader}>Name</h2>
          <h2 className={styles.dataTableHeader}>Type</h2>
          <h2 className={styles.dataTableHeader}>Size</h2>
        </div>
        {
          dataStructure.map((dataElement, index) => 
            <DataElement 
              dataElement={dataElement} 
              key={uuidv4()} 
              removeSelf = {() => {
                const REMOVE_AT_INDEX = 1;
                setDataStructure(dataStructure.toSpliced(index, REMOVE_AT_INDEX));
              }}
            />
          )
        }
      </div>
      <button 
        className={styles.addDataElementButton}
        disabled={deviceDatatypes.length === 0}
        onClick={() => setDataStructure([
          ...dataStructure,
          {
            name: "",
            type: deviceDatatypes[0].requestedType,
            size: deviceDatatypes[0].customSizeBoundary?.min ?? "",
          },
        ])}
      >
        <BsPlusCircle/>
      </button>
    </div>
  );
}

function SuccessPage({successMessage}){
  return (
    <div className={styles.successPageMainDiv}>
      <div>
        <BsCheckCircleFill className={styles.successPageCheckmark}/>
      </div>
      <p>{successMessage}</p>
    </div>
  );
}
