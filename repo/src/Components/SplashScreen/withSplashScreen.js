import React, {Component} from "react";

function SplashMessage() {
    return (
        <div style={{display: "flex", justifyContent: 'center', height: "100vh", textAlign: 'center', alignItems:'center', backgroundColor: '#141414'}}>
            <span className="navbar__logo" style={{fontSize: '50px'}}>AMANFLIX</span>
        </div>
    );
}

export default function withSplashScreen(WrappedComponent) {
    return class extends Component {
        constructor(props) {
            super(props);
            this.state = {
                loading: true,
            };
        }

        async componentDidMount() {
            try {
                setTimeout(() => {
                    this.setState({
                        loading:false,
                    });
                }, 500);
            } catch (err) {
                console.log(err);
                this.setState({
                    loading:false,
                });
            }
        }
        render() {
            if (this.state.loading) return SplashMessage();

            return <WrappedComponent {...this.props} />
        }
    }
}