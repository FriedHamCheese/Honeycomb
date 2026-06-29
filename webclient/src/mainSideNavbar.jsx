import styles from './mainSideNavbar.module.css'

import {useNavigate} from 'react-router';
import {useState} from 'react';
import {BsCpu} from 'react-icons/bs';

export const SelectedPageEnums = {
  WTF: 0,
  DEVICE: 1,
};

export function MainSideNavbar({URLToLoginPage, clearUserSessionToken}){
  const navigate = useNavigate();
  const [profileMenuActive, setProfileMenuActive] = useState(false);
  const [mouseXY, setMouseXY] = useState({x: 0, y: 0});
  
  function toggleProfileMenu(htmlEvent){
    const showProfileMenu = !profileMenuActive;
    if(showProfileMenu)
      setMouseXY({x: htmlEvent.clientX, y: htmlEvent.clientY});
    
    setProfileMenuActive(!profileMenuActive);
    console.log(htmlEvent);
  }
  
  return (
    <nav className={styles.sidebar}>
      <button className={styles.sidebarButton} onClick={() => navigate("/home")}>
        <img src="/honeycomb.png" alt="honeycomb icon" className={styles.honeycombIcon}/> 
      </button>
      <button className={styles.profileButton} onClick={toggleProfileMenu}>
        <img src="/pfp.jpg" style={{width: "100%"}}/>
      </button>
      {
        profileMenuActive && <div className={styles.profileMenu} style={{top: mouseXY.y, left: mouseXY.x}} >
          <p className={styles.profileMenuUsername}>User</p>
          <button 
            onClick={() => {
              clearUserSessionToken();
              navigate(URLToLoginPage);
            }}
            className={styles.profileMenuButton}
          >
            Logout
          </button>
        </div>
      }
    </nav>
  );
}