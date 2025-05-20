import { Button, Flex, Tooltip } from "antd"
import React, { useState } from "react"

const AdminHomePage = () => {
    const [loading, setLoading] = useState(false)

    return (
        <Flex vertical>
            <Flex justify={"space-between"} align="center" style={{marginTop: "20px", marginBottom: "20px"}}>
                <h1>Admin Dashboard</h1>
                <Flex gap={"5px"}>
                    <Tooltip title={`Reload List`}>
                        <Button
                        type="primary"
                        loading={loading}
                        // onClick={fetchShows}
                        style={{
                            width: 90,
                        }}
                        >
                            Reload
                        </Button>
                    </Tooltip>
                </Flex>
            </Flex>
        </Flex>
    )
}

export default AdminHomePage