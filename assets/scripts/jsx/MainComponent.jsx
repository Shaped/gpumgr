/* (C) 2022 Shaped Technologies | GPL v3 */

class MainComponent extends React.Component {
	constructor(props){
		super(props);
		this.state={children:[]};
	}
	addChild(child) {
		child.ref = React.createRef();
		this.setState({
		  children: [...this.state.children, child],
		});
	}
	render() {
		let possibleChildren = { CardWrapper };
		let children=[];
		this.state.children.map((child,i) => {
			children.push(React.createElement(possibleChildren[child.componentName], {ref:child.ref, key:i}));
		});
		return children;
	}
}
